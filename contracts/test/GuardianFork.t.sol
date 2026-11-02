// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {Guardian} from "../src/Guardian.sol";
import {CircuitNFT, Container, DomainBinding, SiteRegistry} from "../src/interfaces/IProtocol.sol";
import {FNDSAVerifier} from "../vendor/fndsa/FNDSAVerifier.sol";

contract MockContainer {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }
}

contract MockNFT {
    address public nftOwner;

    constructor(address owner_) {
        nftOwner = owner_;
    }

    function setOwner(address owner_) external {
        nftOwner = owner_;
    }

    function ownerOf(uint256) external view returns (address) {
        return nftOwner;
    }
}

contract MockBinding {
    uint256 public receivedValue;
    string public boundName;
    address public boundAccount;
    uint256 public boundMonths;

    function bind(string calldata name_, address account_, uint256 months_) external payable {
        receivedValue = msg.value;
        boundName = name_;
        boundAccount = account_;
        boundMonths = months_;
    }
}

contract ReentrantRegistry {
    address public guardian;
    bytes public payload;
    bool public reentryBlocked;

    function configure(address guardian_, bytes calldata payload_) external {
        guardian = guardian_;
        payload = payload_;
    }

    function putFile(address, string calldata, string calldata, bytes32, bytes calldata) external {
        (bool success,) = guardian.call(payload);
        reentryBlocked = !success;
    }

    function removeFile(address, string calldata) external {}
}

contract GuardianForkTest is Test {
    SiteRegistry internal constant REGISTRY = SiteRegistry(0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6);
    DomainBinding internal constant BINDING = DomainBinding(0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9);
    CircuitNFT internal constant NFT = CircuitNFT(0x68f65046fDEab90d8dB376C27B5E6AE159d240cc);
    address internal constant CONTAINER = 0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814;
    uint256 internal constant TOKEN_ID = 10;
    string internal constant PATH = "q-tape/guardian.txt";
    string internal constant NAME = "10.2.4.tape";
    address internal constant OLD_OPERATOR = address(0xA110);
    string internal constant SECRET = "fixtures/test-secret-key.bin";
    string internal constant SECRET_2 = "fixtures/test-secret-key-2.bin";
    bytes4 internal constant SAFE_TRANSFER_FROM_4 =
        bytes4(keccak256("safeTransferFrom(address,address,uint256,bytes)"));

    FNDSAVerifier internal verifier;
    Guardian internal guardian;
    Guardian internal otherGuardian;
    address internal originalOwner;
    bytes internal key;
    bytes internal key2;

    function setUp() public {
        assertEq(block.chainid, 196);
        assertEq(block.number, 74818827);
        originalOwner = NFT.ownerOf(TOKEN_ID);
        key = readKey("fixtures/public-key.hex");
        key2 = readKey("fixtures/public-key-2.hex");
        verifier = new FNDSAVerifier();
        guardian = deployGuardian();
        // A second vault is created while the NFT still belongs to the original
        // owner, so its constructor binding check is valid. It is used for
        // cross-vault replay tests after the NFT moves there.
        otherGuardian = deployGuardian();
        vm.startPrank(originalOwner);
        REGISTRY.setOperator(CONTAINER, OLD_OPERATOR, 30 days);
        NFT.safeTransferFrom(originalOwner, address(guardian), TOKEN_ID);
        vm.stopPrank();
        vm.deal(address(this), 100 ether);
    }

    // ---------------------------------------------------------------------
    // Helpers: independently encode and sign every request. Never sign a
    // digest returned by Guardian code.
    // ---------------------------------------------------------------------

    function readKey(string memory path) internal returns (bytes memory result) {
        result = vm.parseBytes(vm.readLine(path));
        vm.closeFile(path);
    }

    function signDigest(bytes32 digest, string memory secretPath) internal returns (bytes memory) {
        string[] memory command = new string[](4);
        command[0] = "bin/falcon-signer";
        command[1] = "sign";
        command[2] = secretPath;
        command[3] = vm.toString(digest);
        return vm.ffi(command);
    }

    function keyProofDigest(bytes memory publicKey_, bytes32 challenge, address vault)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                keccak256(bytes("Q-Tape key possession v1")),
                block.chainid,
                vault,
                keccak256(publicKey_),
                challenge
            )
        );
    }

    function deployGuardian() internal returns (Guardian deployed) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        bytes32 challenge = keccak256("guardian test key challenge");
        bytes memory proof = signDigest(keyProofDigest(key, challenge, predicted), SECRET);
        deployed = new Guardian(
            address(verifier),
            address(NFT),
            TOKEN_ID,
            CONTAINER,
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            proof
        );
    }

    function sign(
        Guardian account,
        uint8 operation,
        Guardian.Call[] memory calls,
        uint256 requestNonce,
        uint256 expiry,
        string memory secretPath
    ) internal returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encode(
                keccak256(bytes("Q-Tape Guardian v1")),
                block.chainid,
                address(account),
                operation,
                keccak256(abi.encode(calls)),
                requestNonce,
                expiry
            )
        );
        return signDigest(digest, secretPath);
    }

    function oneCall(address target, uint256 value, bytes memory data)
        internal
        pure
        returns (Guardian.Call[] memory calls)
    {
        calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(target, value, data);
    }

    function publication(string memory path, bytes memory data)
        internal
        pure
        returns (Guardian.Call[] memory)
    {
        return oneCall(
            address(REGISTRY),
            0,
            abi.encodeCall(SiteRegistry.putFile, (CONTAINER, path, "text/plain", sha256(data), data))
        );
    }

    function submit(uint8 operation, Guardian.Call[] memory calls) internal {
        uint256 requestNonce = guardian.nonce();
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, operation, calls, requestNonce, expiry, SECRET);
        guardian.execute(operation, calls, requestNonce, expiry, signature);
    }

    // ---------------------------------------------------------------------
    // Ported GuardianLab cases (15)
    // ---------------------------------------------------------------------

    function test_referenceFalconSignatureInteroperatesWithSolidity() public {
        bytes32 message = keccak256("independent Falcon interoperability test");
        bytes memory signature = signDigest(message, SECRET);
        assertTrue(verifier.verify(0x0301, key, abi.encodePacked(message), signature));
        assertFalse(verifier.verify(0x0301, key, abi.encodePacked(bytes32(uint256(message) ^ 1)), signature));
        emit log_named_uint("FalconPublicKeyBytes", key.length);
        emit log_named_uint("FalconSignatureBytes", signature.length);
    }

    function test_validFalconCanPublishAppendDeleteAndSetFallback() public {
        submit(0, publication(PATH, bytes("hello ")));
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("hello "));
        submit(
            0,
            oneCall(
                address(REGISTRY),
                0,
                abi.encodeCall(SiteRegistry.appendChunk, (CONTAINER, PATH, 1, bytes("world")))
            )
        );
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("hello world"));
        Guardian.Call[] memory calls = new Guardian.Call[](2);
        calls[0] =
            Guardian.Call(address(REGISTRY), 0, abi.encodeCall(SiteRegistry.setFallback, (CONTAINER, PATH)));
        calls[1] =
            Guardian.Call(address(REGISTRY), 0, abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH)));
        submit(0, calls);
        assertEq(REGISTRY.fallbackPath(CONTAINER), PATH);
        (uint32 size,,,, uint256 chunks) = REGISTRY.fileInfo(CONTAINER, PATH);
        assertEq(size, 0);
        assertEq(chunks, 0);
        assertEq(guardian.nonce(), 3);
    }

    function test_validFalconCanRenewAndRevokeLegacyOperator() public {
        uint40 beforeExpiry = BINDING.containerPaidUntil(CONTAINER);
        assertEq(BINDING.monthlyFee(), 0, "fixture only exercises live zero-fee renewal");
        submit(0, oneCall(address(BINDING), 0, abi.encodeCall(DomainBinding.bind, (NAME, CONTAINER, 1))));
        assertEq(BINDING.containerPaidUntil(CONTAINER), beforeExpiry + 30 days);
        submit(
            0,
            oneCall(
                address(REGISTRY), 0, abi.encodeCall(SiteRegistry.setOperator, (CONTAINER, OLD_OPERATOR, 0))
            )
        );
        bytes memory data = publication(PATH, bytes("stolen"))[0].data;
        vm.prank(OLD_OPERATOR);
        (bool success,) = address(REGISTRY).call(data);
        assertFalse(success);
    }

    function test_missingAndMutatedSignatureRejected() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, bytes(""));
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        signature[signature.length / 2] ^= bytes1(uint8(1));
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function test_wrongFalconKeyRejected() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET_2);
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_modifiedTargetValueDataOperationAndExpiryRejected() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        calls[0].target = address(BINDING);
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls[0].target = address(REGISTRY);
        calls[0].value = 1;
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute{value: 1}(0, calls, 0, expiry, signature);
        calls[0].value = 0;
        calls[0].data = publication(PATH, bytes("attacker"))[0].data;
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls = publication(PATH, bytes("approved"));
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(1, calls, 0, expiry, signature);
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry + 1, signature);
        vm.expectRevert(Guardian.BadNonce.selector);
        guardian.execute(0, calls, 1, expiry, signature);
    }

    function test_reorderingSignedBatchRejected() public {
        Guardian.Call[] memory calls = new Guardian.Call[](2);
        calls[0] = publication(PATH, bytes("one"))[0];
        calls[1] = publication("q-tape/second.txt", bytes("two"))[0];
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        Guardian.Call memory first = calls[0];
        calls[0] = calls[1];
        calls[1] = first;
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_successfulRequestCannotReplayAndRelayerCanChange() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.prank(address(0xB001));
        guardian.execute(0, calls, 0, expiry, signature);
        vm.prank(address(0xB002));
        vm.expectRevert(Guardian.BadNonce.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("approved"));
    }

    function test_expiredRequestRejected() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 1;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.warp(expiry + 1);
        vm.expectRevert(Guardian.Expired.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_signatureCannotCrossChain() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.chainId(197);
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_directNftTheftAndUnsignedGuardianTransferRejected() public {
        address[3] memory callers = [originalOwner, OLD_OPERATOR, address(0xB001)];
        for (uint256 i; i < callers.length; i++) {
            vm.prank(callers[i]);
            (bool success,) = address(NFT)
                .call(abi.encodeCall(CircuitNFT.transferFrom, (address(guardian), callers[i], TOKEN_ID)));
            assertFalse(success);
        }
        Guardian.Call[] memory calls = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(0xBEEF), TOKEN_ID))
        );
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(1, calls, 0, block.timestamp + 300, bytes(""));
        assertEq(NFT.ownerOf(TOKEN_ID), address(guardian));
    }

    function test_validFalconTransferAndCrossGuardianReplay() public {
        Guardian.Call[] memory originalCalls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory oldSignature = sign(guardian, 0, originalCalls, 0, expiry, SECRET);
        submit(
            1,
            oneCall(
                address(NFT),
                0,
                abi.encodeCall(
                    CircuitNFT.safeTransferFrom, (address(guardian), address(otherGuardian), TOKEN_ID)
                )
            )
        );
        assertEq(NFT.ownerOf(TOKEN_ID), address(otherGuardian));
        vm.expectRevert(Guardian.InvalidSignature.selector);
        otherGuardian.execute(0, originalCalls, 0, expiry, oldSignature);
        bytes memory correct = sign(otherGuardian, 0, originalCalls, 0, expiry, SECRET);
        otherGuardian.execute(0, originalCalls, 0, expiry, correct);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("approved"));
    }

    function test_keyRotationDisablesOldKeyAndAcceptsNewKey() public {
        bytes32 challenge = bytes32(uint256(0xC0FFEE));
        bytes memory proof = signDigest(keyProofDigest(key2, challenge, address(guardian)), SECRET_2);
        submit(2, oneCall(address(guardian), 0, abi.encode(key2, challenge, proof)));
        assertEq(guardian.publicKey(), key2);
        assertEq(guardian.keyFingerprint(), keccak256(key2));

        Guardian.Call[] memory calls = publication(PATH, bytes("rotated"));
        uint256 expiry = block.timestamp + 300;
        bytes memory oldSignature = sign(guardian, 0, calls, 1, expiry, SECRET);
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 1, expiry, oldSignature);
        bytes memory newSignature = sign(guardian, 0, calls, 1, expiry, SECRET_2);
        guardian.execute(0, calls, 1, expiry, newSignature);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("rotated"));
    }

    function test_signedRequestStillCannotGrantOperatorsApproveNftOrWriteAnotherContainer() public {
        Guardian.Call[] memory calls = oneCall(
            address(REGISTRY),
            0,
            abi.encodeCall(SiteRegistry.setOperator, (CONTAINER, address(0xB001), 1 days))
        );
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls = oneCall(address(NFT), 0, abi.encodeCall(CircuitNFT.approve, (address(0xB001), TOKEN_ID)));
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls =
            oneCall(address(REGISTRY), 0, abi.encodeCall(SiteRegistry.removeFile, (address(0x1234), PATH)));
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_failedBatchRollsBackWritesAndNonce() public {
        Guardian.Call[] memory calls = new Guardian.Call[](2);
        calls[0] = publication(PATH, bytes("must roll back"))[0];
        calls[1] = Guardian.Call(
            address(REGISTRY), 0, abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, "q-tape/absent.txt"))
        );
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert();
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
        (,,,, uint256 chunks) = REGISTRY.fileInfo(CONTAINER, PATH);
        assertEq(chunks, 0);
        submit(0, publication(PATH, bytes("retry")));
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("retry"));
    }

    // ---------------------------------------------------------------------
    // Constructor and configuration rejection
    // ---------------------------------------------------------------------

    function test_constructorStoresBoundConfiguration() public view {
        assertEq(guardian.verifier(), address(verifier));
        assertEq(guardian.nft(), address(NFT));
        assertEq(guardian.tokenId(), TOKEN_ID);
        assertEq(guardian.container(), CONTAINER);
        assertEq(guardian.registry(), address(REGISTRY));
        assertEq(guardian.binding(), address(BINDING));
        assertEq(guardian.canonicalNameHash(), keccak256(bytes(NAME)));
        assertEq(guardian.publicKey(), key);
        assertEq(guardian.keyFingerprint(), keccak256(key));
        assertEq(guardian.nonce(), 0);
    }

    function test_constructorRejectsEOACodeDependencies() public {
        bytes32 challenge = keccak256("constructor rejection challenge");
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(0xBEEF),
            address(NFT),
            TOKEN_ID,
            CONTAINER,
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            ""
        );
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(0xBEEF),
            TOKEN_ID,
            CONTAINER,
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            ""
        );
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(NFT),
            TOKEN_ID,
            address(0xBEEF),
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            ""
        );
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(NFT),
            TOKEN_ID,
            CONTAINER,
            address(0xBEEF),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            ""
        );
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(NFT),
            TOKEN_ID,
            CONTAINER,
            address(REGISTRY),
            address(0xBEEF),
            keccak256(bytes(NAME)),
            key,
            challenge,
            ""
        );
    }

    function test_constructorRejectsWrongContainerBinding() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(0xBEEF));
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            bytes32(uint256(1)),
            ""
        );
    }

    function test_constructorRejectsZeroNameHash() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(this));
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            bytes32(0),
            key,
            bytes32(uint256(1)),
            ""
        );
    }

    function test_constructorRejectsNonexistentToken() public {
        vm.expectRevert(Guardian.InvalidConfiguration.selector);
        new Guardian(
            address(verifier),
            address(NFT),
            uint256(0xFFFFFFFF),
            CONTAINER,
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            bytes32(uint256(1)),
            ""
        );
    }

    function test_constructorRejectsBadPublicKeyHeaderAndLength() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(this));
        bytes memory badHeader = new bytes(897);
        badHeader[0] = 0x0a;
        bytes memory tooShort = new bytes(896);
        tooShort[0] = 0x09;
        bytes memory tooLong = new bytes(898);
        tooLong[0] = 0x09;
        bytes32 challenge = bytes32(uint256(1));

        vm.expectRevert(Guardian.InvalidPublicKey.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            bytes32(uint256(1)),
            badHeader,
            challenge,
            ""
        );
        vm.expectRevert(Guardian.InvalidPublicKey.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            bytes32(uint256(1)),
            tooShort,
            challenge,
            ""
        );
        vm.expectRevert(Guardian.InvalidPublicKey.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            bytes32(uint256(1)),
            tooLong,
            challenge,
            ""
        );
    }

    function test_constructorRequiresValidKeyProofEvenForWellFormedKey() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(this));
        bytes memory zeroKey = new bytes(897);
        zeroKey[0] = 0x09;
        vm.expectRevert(Guardian.InvalidKeyProof.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            bytes32(uint256(1)),
            zeroKey,
            bytes32(uint256(1)),
            ""
        );
    }

    function test_constructorRejectsMissingAndWrongKeyProof() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(this));
        bytes32 challenge = bytes32(uint256(0x1234));
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));

        vm.expectRevert(Guardian.InvalidKeyProof.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            ""
        );

        predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        bytes memory wrongKeyProof = signDigest(keyProofDigest(key, challenge, predicted), SECRET_2);
        vm.expectRevert(Guardian.InvalidKeyProof.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            wrongKeyProof
        );

        predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        bytes memory wrongVaultProof =
            signDigest(keyProofDigest(key, challenge, address(uint160(predicted) + 1)), SECRET);
        vm.expectRevert(Guardian.InvalidKeyProof.selector);
        new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(BINDING),
            keccak256(bytes(NAME)),
            key,
            challenge,
            wrongVaultProof
        );
    }

    // ---------------------------------------------------------------------
    // Expiry, nonce, value and calldata boundaries
    // ---------------------------------------------------------------------

    function test_expiryEqualToCurrentSecondAcceptedAndNextSecondRejected() public {
        uint256 nowTs = vm.getBlockTimestamp();
        Guardian.Call[] memory calls = publication(PATH, bytes("same second"));
        bytes memory signature = sign(guardian, 0, calls, 0, nowTs, SECRET);
        guardian.execute(0, calls, 0, nowTs, signature);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("same second"));
        assertEq(guardian.nonce(), 1);

        Guardian.Call[] memory later = publication("q-tape/later.txt", bytes("later"));
        bytes memory laterSignature = sign(guardian, 0, later, 1, nowTs, SECRET);
        vm.warp(nowTs + 1);
        vm.expectRevert(Guardian.Expired.selector);
        guardian.execute(0, later, 1, nowTs, laterSignature);
    }

    function test_emptyCallsRejected() public {
        Guardian.Call[] memory calls = new Guardian.Call[](0);
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.BadOperation.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function test_badOperationRejected() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("x"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 3, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.BadOperation.selector);
        guardian.execute(3, calls, 0, expiry, signature);
    }

    function test_badValueRejected() public {
        Guardian.Call[] memory calls =
            oneCall(address(BINDING), 5, abi.encodeCall(DomainBinding.bind, (NAME, CONTAINER, 1)));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.BadValue.selector);
        guardian.execute{value: 0}(0, calls, 0, expiry, signature);
    }

    function test_trailingAndMalformedCalldataRejected() public {
        bytes memory base = publication(PATH, bytes("x"))[0].data;
        Guardian.Call[] memory calls = oneCall(address(REGISTRY), 0, bytes.concat(base, hex"00"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);

        calls = oneCall(address(REGISTRY), 0, abi.encodePacked(SiteRegistry.removeFile.selector));
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert();
        guardian.execute(0, calls, 0, expiry, signature);

        bytes memory exitData =
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(0xBEEF), TOKEN_ID));
        calls = oneCall(address(NFT), 0, bytes.concat(exitData, hex"00"));
        signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function test_signedRegistryCallCannotForwardValue() public {
        Guardian.Call[] memory calls =
            oneCall(address(REGISTRY), 1, abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH)));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute{value: 1}(0, calls, 0, expiry, signature);
    }

    // ---------------------------------------------------------------------
    // Target, selector and approval boundaries
    // ---------------------------------------------------------------------

    function test_signedRequestCannotUseArbitraryTargetOrDelegatecallSelectors() public {
        uint256 expiry = block.timestamp + 300;
        Guardian.Call[] memory calls = oneCall(address(0xDEAD), 0, hex"deadbeef");
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);

        calls =
            oneCall(address(NFT), 0, abi.encodeCall(CircuitNFT.setApprovalForAll, (address(0xB001), true)));
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);

        calls = oneCall(
            address(REGISTRY),
            0,
            abi.encodeWithSelector(
                bytes4(keccak256("upgradeToAndCall(address,bytes)")), address(0x1234), bytes("")
            )
        );
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);

        calls = oneCall(address(BINDING), 0, abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH)));
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_exitOnlyAcceptsThreeArgumentSafeTransferFrom() public {
        uint256 expiry = block.timestamp + 300;
        bytes memory fourArg = abi.encodeWithSelector(
            SAFE_TRANSFER_FROM_4, address(guardian), address(0xBEEF), TOKEN_ID, bytes("")
        );
        Guardian.Call[] memory calls = oneCall(address(NFT), 0, fourArg);
        bytes memory signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);

        calls = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.transferFrom, (address(guardian), address(0xBEEF), TOKEN_ID))
        );
        signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);

        calls = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(0xBEEF), address(0xBEEF), TOKEN_ID))
        );
        signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);

        calls = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(0), TOKEN_ID))
        );
        signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);

        calls = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(0xBEEF), TOKEN_ID + 1))
        );
        signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);
    }

    function test_exitRejectsMultipleCalls() public {
        Guardian.Call[] memory calls = new Guardian.Call[](2);
        calls[0] = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(0xBEEF), TOKEN_ID))
        )[0];
        calls[1] = publication(PATH, bytes("x"))[0];
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 1, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(1, calls, 0, expiry, signature);
    }

    function test_onERC721ReceivedRestrictedToBoundNftAndToken() public {
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.onERC721Received(address(0), address(0), TOKEN_ID, "");

        vm.prank(address(NFT));
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.onERC721Received(address(0), address(0), TOKEN_ID + 1, "");

        vm.prank(address(NFT));
        assertEq(guardian.onERC721Received(address(0), address(0), TOKEN_ID, ""), bytes4(0x150b7a02));
    }

    function test_plainEthAndUnknownSelectorRejected() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(guardian).call{value: 1 ether}(hex"");
        assertFalse(success);
        (success,) = address(guardian).call(hex"12345678");
        assertFalse(success);
    }

    function test_labDomainSignatureRejected() public {
        Guardian.Call[] memory calls = publication(PATH, bytes("lab"));
        uint256 expiry = block.timestamp + 300;
        bytes32 digest = keccak256(
            abi.encode(
                keccak256(bytes("Q-Tape lab Guardian v1")),
                block.chainid,
                address(guardian),
                uint8(0),
                keccak256(abi.encode(calls)),
                uint256(0),
                expiry
            )
        );
        bytes memory signature = signDigest(digest, SECRET);
        vm.expectRevert(Guardian.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_bindingRequiresCanonicalNameAndContainer() public {
        uint256 expiry = block.timestamp + 300;
        Guardian.Call[] memory calls =
            oneCall(address(BINDING), 0, abi.encodeCall(DomainBinding.bind, ("wrong.tape", CONTAINER, 1)));
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);

        calls = oneCall(address(BINDING), 0, abi.encodeCall(DomainBinding.bind, (NAME, address(0x1234), 1)));
        signature = sign(guardian, 0, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_bindingForwardsSignedValue() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(this));
        MockBinding mockBinding = new MockBinding();

        bytes32 challenge = bytes32(uint256(0xB0B));
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        bytes memory proof = signDigest(keyProofDigest(key, challenge, predicted), SECRET);
        Guardian bound = new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(REGISTRY),
            address(mockBinding),
            keccak256(bytes("value.test")),
            key,
            challenge,
            proof
        );
        mockNft.setOwner(address(bound));

        Guardian.Call[] memory calls = oneCall(
            address(mockBinding),
            5,
            abi.encodeCall(DomainBinding.bind, ("value.test", address(mockContainer), 2))
        );
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(bound, 0, calls, 0, expiry, SECRET);
        bound.execute{value: 5}(0, calls, 0, expiry, signature);

        assertEq(mockBinding.receivedValue(), 5);
        assertEq(mockBinding.boundName(), "value.test");
        assertEq(mockBinding.boundAccount(), address(mockContainer));
        assertEq(mockBinding.boundMonths(), 2);
    }

    function test_executeRejectedWhenNftNoLongerHeld() public {
        submit(
            1,
            oneCall(
                address(NFT),
                0,
                abi.encodeCall(
                    CircuitNFT.safeTransferFrom, (address(guardian), address(otherGuardian), TOKEN_ID)
                )
            )
        );
        Guardian.Call[] memory calls = publication(PATH, bytes("not holder"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 1, expiry, SECRET);
        vm.expectRevert(Guardian.NotHolder.selector);
        guardian.execute(0, calls, 1, expiry, signature);
    }

    // ---------------------------------------------------------------------
    // Key rotation boundaries
    // ---------------------------------------------------------------------

    function test_rotateKeyRequiresNewKeyProof() public {
        bytes32 challenge = bytes32(uint256(0xBEEF));
        bytes memory proofFromOldKey = signDigest(keyProofDigest(key2, challenge, address(guardian)), SECRET);
        Guardian.Call[] memory calls =
            oneCall(address(guardian), 0, abi.encode(key2, challenge, proofFromOldKey));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 2, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.InvalidKeyProof.selector);
        guardian.execute(2, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
        assertEq(guardian.publicKey(), key);
    }

    function test_rotateKeyRejectsInvalidNewKeyEncoding() public {
        bytes memory shortKey = new bytes(896);
        shortKey[0] = 0x09;
        Guardian.Call[] memory calls =
            oneCall(address(guardian), 0, abi.encode(shortKey, bytes32(uint256(1)), bytes("")));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 2, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.InvalidPublicKey.selector);
        guardian.execute(2, calls, 0, expiry, signature);
    }

    function test_rotateKeyRejectsForeignTargetAndMultipleCalls() public {
        uint256 expiry = block.timestamp + 300;
        Guardian.Call[] memory calls = oneCall(address(REGISTRY), 0, hex"1234");
        bytes memory signature = sign(guardian, 2, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(2, calls, 0, expiry, signature);

        calls = new Guardian.Call[](2);
        calls[0] = Guardian.Call(address(guardian), 0, abi.encode(key2, bytes32(uint256(1)), bytes("")));
        calls[1] = Guardian.Call(address(guardian), 0, abi.encode(key2, bytes32(uint256(2)), bytes("")));
        signature = sign(guardian, 2, calls, 0, expiry, SECRET);
        vm.expectRevert(Guardian.DisallowedCall.selector);
        guardian.execute(2, calls, 0, expiry, signature);
    }

    // ---------------------------------------------------------------------
    // Reentrancy
    // ---------------------------------------------------------------------

    function test_reentrancyGuardBlocksReentry() public {
        MockNFT mockNft = new MockNFT(address(this));
        MockContainer mockContainer = new MockContainer(address(this));
        ReentrantRegistry reentrantRegistry = new ReentrantRegistry();

        bytes32 challenge = bytes32(uint256(0xAA));
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        bytes memory proof = signDigest(keyProofDigest(key, challenge, predicted), SECRET);
        Guardian guarded = new Guardian(
            address(verifier),
            address(mockNft),
            1,
            address(mockContainer),
            address(reentrantRegistry),
            address(BINDING),
            keccak256(bytes("reentrancy.test")),
            key,
            challenge,
            proof
        );
        mockNft.setOwner(address(guarded));

        uint256 expiry = block.timestamp + 300;
        Guardian.Call[] memory innerCalls = oneCall(
            address(reentrantRegistry),
            0,
            abi.encodeCall(SiteRegistry.removeFile, (address(mockContainer), "x"))
        );
        bytes memory innerSignature = sign(guarded, 0, innerCalls, 1, expiry, SECRET);
        bytes memory payload = abi.encodeWithSelector(
            Guardian.execute.selector, uint8(0), innerCalls, uint256(1), expiry, innerSignature
        );
        reentrantRegistry.configure(address(guarded), payload);

        Guardian.Call[] memory outerCalls = oneCall(
            address(reentrantRegistry),
            0,
            abi.encodeCall(
                SiteRegistry.putFile, (address(mockContainer), "x", "text/plain", bytes32(0), bytes("x"))
            )
        );
        bytes memory outerSignature = sign(guarded, 0, outerCalls, 0, expiry, SECRET);
        guarded.execute(0, outerCalls, 0, expiry, outerSignature);

        assertTrue(reentrantRegistry.reentryBlocked());
        assertEq(guarded.nonce(), 1);
    }
}
