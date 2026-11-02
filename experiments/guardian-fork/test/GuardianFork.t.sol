// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {GuardianLab} from "../src/GuardianLab.sol";
import {CircuitNFT, DomainBinding, SiteRegistry} from "../src/Protocol.sol";
import {FNDSAVerifier} from "../vendor/fndsa/FNDSAVerifier.sol";

contract GuardianForkTest is Test {
    SiteRegistry internal constant REGISTRY = SiteRegistry(0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6);
    DomainBinding internal constant BINDING = DomainBinding(0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9);
    CircuitNFT internal constant NFT = CircuitNFT(0x68f65046fDEab90d8dB376C27B5E6AE159d240cc);
    address internal constant CONTAINER = 0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814;
    uint256 internal constant TOKEN_ID = 10;
    string internal constant PATH = "q-tape-lab/guardian.txt";
    address internal constant OLD_OPERATOR = address(0xA110);
    FNDSAVerifier internal verifier;
    GuardianLab internal guardian;
    address internal originalOwner;
    bytes internal key;

    function setUp() public {
        assertEq(block.chainid, 196);
        assertEq(block.number, 74818827);
        originalOwner = NFT.ownerOf(TOKEN_ID);
        key = readKey("fixtures/public-key.hex");
        verifier = new FNDSAVerifier();
        guardian = deployGuardian();
        vm.startPrank(originalOwner);
        REGISTRY.setOperator(CONTAINER, OLD_OPERATOR, 30 days);
        NFT.safeTransferFrom(originalOwner, address(guardian), TOKEN_ID);
        vm.stopPrank();
        vm.deal(address(this), 100 ether);
    }

    function readKey(string memory path) internal returns (bytes memory result) {
        result = vm.parseBytes(vm.readLine(path));
        vm.closeFile(path);
    }

    function deployGuardian() internal returns (GuardianLab) {
        return new GuardianLab(
            verifier,
            address(NFT),
            TOKEN_ID,
            CONTAINER,
            address(REGISTRY),
            address(BINDING),
            key,
            "10.2.4.tape"
        );
    }

    // Independently encode the published request format; never sign a digest returned by Guardian code.
    function sign(
        GuardianLab account,
        uint8 operation,
        GuardianLab.Call[] memory calls,
        uint256 requestNonce,
        uint256 expiry,
        string memory secretPath
    ) internal returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encode(
                keccak256("Q-Tape lab Guardian v1"),
                block.chainid,
                address(account),
                operation,
                keccak256(abi.encode(calls)),
                requestNonce,
                expiry
            )
        );
        string[] memory command = new string[](4);
        command[0] = "bin/falcon-signer";
        command[1] = "sign";
        command[2] = secretPath;
        command[3] = vm.toString(digest);
        return vm.ffi(command);
    }

    function oneCall(address target, uint256 value, bytes memory data)
        internal
        pure
        returns (GuardianLab.Call[] memory calls)
    {
        calls = new GuardianLab.Call[](1);
        calls[0] = GuardianLab.Call(target, value, data);
    }

    function publication(string memory path, bytes memory data)
        internal
        pure
        returns (GuardianLab.Call[] memory)
    {
        return oneCall(
            address(REGISTRY),
            0,
            abi.encodeCall(SiteRegistry.putFile, (CONTAINER, path, "text/plain", sha256(data), data))
        );
    }

    function submit(uint8 operation, GuardianLab.Call[] memory calls) internal {
        uint256 requestNonce = guardian.nonce();
        uint256 expiry = block.timestamp + 300;
        bytes memory signature =
            sign(guardian, operation, calls, requestNonce, expiry, "fixtures/test-secret-key.bin");
        guardian.execute(operation, calls, requestNonce, expiry, signature);
    }

    function test_referenceFalconSignatureInteroperatesWithSolidity() public {
        bytes32 message = keccak256("independent Falcon interoperability test");
        string[] memory command = new string[](4);
        command[0] = "bin/falcon-signer";
        command[1] = "sign";
        command[2] = "fixtures/test-secret-key.bin";
        command[3] = vm.toString(message);
        bytes memory signature = vm.ffi(command);
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
        GuardianLab.Call[] memory calls = new GuardianLab.Call[](2);
        calls[0] = GuardianLab.Call(
            address(REGISTRY), 0, abi.encodeCall(SiteRegistry.setFallback, (CONTAINER, PATH))
        );
        calls[1] = GuardianLab.Call(
            address(REGISTRY), 0, abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH))
        );
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
        submit(
            0, oneCall(address(BINDING), 0, abi.encodeCall(DomainBinding.bind, ("10.2.4.tape", CONTAINER, 1)))
        );
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
        GuardianLab.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, bytes(""));
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        signature[signature.length / 2] ^= bytes1(uint8(1));
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function test_wrongFalconKeyRejected() public {
        GuardianLab.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key-2.bin");
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_modifiedTargetValueDataOperationAndExpiryRejected() public {
        GuardianLab.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        calls[0].target = address(BINDING);
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls[0].target = address(REGISTRY);
        calls[0].value = 1;
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute{value: 1}(0, calls, 0, expiry, signature);
        calls[0].value = 0;
        calls[0].data = publication(PATH, bytes("attacker"))[0].data;
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls = publication(PATH, bytes("approved"));
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(1, calls, 0, expiry, signature);
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry + 1, signature);
        vm.expectRevert(GuardianLab.BadNonce.selector);
        guardian.execute(0, calls, 1, expiry, signature);
    }

    function test_reorderingSignedBatchRejected() public {
        GuardianLab.Call[] memory calls = new GuardianLab.Call[](2);
        calls[0] = publication(PATH, bytes("one"))[0];
        calls[1] = publication("q-tape-lab/second.txt", bytes("two"))[0];
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        GuardianLab.Call memory first = calls[0];
        calls[0] = calls[1];
        calls[1] = first;
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_successfulRequestCannotReplayAndRelayerCanChange() public {
        GuardianLab.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.prank(address(0xB001));
        guardian.execute(0, calls, 0, expiry, signature);
        vm.prank(address(0xB002));
        vm.expectRevert(GuardianLab.BadNonce.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("approved"));
    }

    function test_expiredRequestRejected() public {
        GuardianLab.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 1;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.warp(expiry + 1);
        vm.expectRevert(GuardianLab.Expired.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_signatureCannotCrossChain() public {
        GuardianLab.Call[] memory calls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.chainId(197);
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
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
        GuardianLab.Call[] memory calls = oneCall(
            address(NFT),
            0,
            abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(0xBEEF), TOKEN_ID))
        );
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(1, calls, 0, block.timestamp + 300, bytes(""));
        assertEq(NFT.ownerOf(TOKEN_ID), address(guardian));
    }

    function test_validFalconTransferAndCrossGuardianReplay() public {
        GuardianLab other = deployGuardian();
        GuardianLab.Call[] memory originalCalls = publication(PATH, bytes("approved"));
        uint256 expiry = block.timestamp + 300;
        bytes memory oldSignature =
            sign(guardian, 0, originalCalls, 0, expiry, "fixtures/test-secret-key.bin");
        submit(
            1,
            oneCall(
                address(NFT),
                0,
                abi.encodeCall(CircuitNFT.safeTransferFrom, (address(guardian), address(other), TOKEN_ID))
            )
        );
        assertEq(NFT.ownerOf(TOKEN_ID), address(other));
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        other.execute(0, originalCalls, 0, expiry, oldSignature);
        bytes memory correct = sign(other, 0, originalCalls, 0, expiry, "fixtures/test-secret-key.bin");
        other.execute(0, originalCalls, 0, expiry, correct);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("approved"));
    }

    function test_keyRotationDisablesOldKeyAndAcceptsNewKey() public {
        bytes memory replacement = readKey("fixtures/public-key-2.hex");
        submit(2, oneCall(address(guardian), 0, abi.encode(replacement)));
        assertEq(guardian.publicKey(), replacement);
        GuardianLab.Call[] memory calls = publication(PATH, bytes("rotated"));
        uint256 expiry = block.timestamp + 300;
        bytes memory oldSignature = sign(guardian, 0, calls, 1, expiry, "fixtures/test-secret-key.bin");
        vm.expectRevert(GuardianLab.InvalidSignature.selector);
        guardian.execute(0, calls, 1, expiry, oldSignature);
        bytes memory newSignature = sign(guardian, 0, calls, 1, expiry, "fixtures/test-secret-key-2.bin");
        guardian.execute(0, calls, 1, expiry, newSignature);
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("rotated"));
    }

    function test_signedRequestStillCannotGrantOperatorsApproveNftOrWriteAnotherContainer() public {
        GuardianLab.Call[] memory calls = oneCall(
            address(REGISTRY),
            0,
            abi.encodeCall(SiteRegistry.setOperator, (CONTAINER, address(0xB001), 1 days))
        );
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.expectRevert(GuardianLab.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls = oneCall(address(NFT), 0, abi.encodeCall(CircuitNFT.approve, (address(0xB001), TOKEN_ID)));
        signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.expectRevert(GuardianLab.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        calls =
            oneCall(address(REGISTRY), 0, abi.encodeCall(SiteRegistry.removeFile, (address(0x1234), PATH)));
        signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.expectRevert(GuardianLab.DisallowedCall.selector);
        guardian.execute(0, calls, 0, expiry, signature);
    }

    function test_failedBatchRollsBackWritesAndNonce() public {
        GuardianLab.Call[] memory calls = new GuardianLab.Call[](2);
        calls[0] = publication(PATH, bytes("must roll back"))[0];
        calls[1] = GuardianLab.Call(
            address(REGISTRY),
            0,
            abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, "q-tape-lab/absent.txt"))
        );
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry, "fixtures/test-secret-key.bin");
        vm.expectRevert();
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
        (,,,, uint256 chunks) = REGISTRY.fileInfo(CONTAINER, PATH);
        assertEq(chunks, 0);
        submit(0, publication(PATH, bytes("retry")));
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("retry"));
    }
}
