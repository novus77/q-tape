// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Guardian} from "../src/Guardian.sol";
import {FNDSAVerifier} from "../vendor/fndsa/FNDSAVerifier.sol";

// Fuzz-only mocks. They are not a deployed protocol and do not replace the
// fixed-fork evidence in GuardianFork.t.sol.
contract FuzzNFT {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function setOwner(address owner_) external {
        owner = owner_;
    }

    function ownerOf(uint256) external view returns (address) {
        return owner;
    }
}

contract FuzzContainer {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }
}

contract FuzzBinding {
    function bind(string calldata, address, uint256) external payable {}
}

contract FuzzRegistry {}

contract GuardianFuzzTest is Test {
    string internal constant NAME = "10.2.4.tape";
    string internal constant SECRET = "fixtures/test-secret-key.bin";
    bytes internal key;

    FNDSAVerifier internal verifier;
    FuzzNFT internal nft;
    FuzzContainer internal container;
    FuzzBinding internal binding;
    FuzzRegistry internal registry;
    Guardian internal guardian;

    function setUp() public {
        key = readKey("fixtures/public-key.hex");
        verifier = new FNDSAVerifier();
        nft = new FuzzNFT(address(this));
        container = new FuzzContainer(address(this));
        binding = new FuzzBinding();
        registry = new FuzzRegistry();
        guardian = deployGuardian();
        nft.setOwner(address(guardian));
        vm.deal(address(this), 1_000 ether);
    }

    function readKey(string memory path) internal returns (bytes memory result) {
        result = vm.parseBytes(vm.readLine(path));
        vm.closeFile(path);
    }

    function signDigest(bytes32 digest) internal returns (bytes memory) {
        string[] memory command = new string[](4);
        command[0] = "bin/falcon-signer";
        command[1] = "sign";
        command[2] = SECRET;
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
        bytes32 challenge = keccak256("fuzz key challenge");
        bytes memory proof = signDigest(keyProofDigest(key, challenge, predicted));
        deployed = new Guardian(
            address(verifier),
            address(nft),
            1,
            address(container),
            address(registry),
            address(binding),
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
        uint256 nonce,
        uint256 expiry
    ) internal returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encode(
                keccak256(bytes("Q-Tape Guardian v1")),
                block.chainid,
                address(account),
                operation,
                keccak256(abi.encode(calls)),
                nonce,
                expiry
            )
        );
        return signDigest(digest);
    }

    function bindCall() internal view returns (Guardian.Call[] memory calls) {
        calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(
            address(binding), 0, abi.encodeCall(FuzzBinding.bind, (NAME, address(container), uint256(1)))
        );
    }

    function testFuzz_invalidNonceNeverChangesState(uint256 badNonce) public {
        vm.assume(badNonce != 0);
        Guardian.Call[] memory calls = bindCall();
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry);
        vm.expectRevert(Guardian.BadNonce.selector);
        guardian.execute(0, calls, badNonce, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function testFuzz_expiredRequestNeverChangesState(uint256 expiry) public {
        expiry = bound(expiry, 0, block.timestamp - 1);
        Guardian.Call[] memory calls = bindCall();
        bytes memory signature = sign(guardian, 0, calls, 0, expiry);
        vm.expectRevert(Guardian.Expired.selector);
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function testFuzz_invalidOperationNeverChangesState(uint8 operation) public {
        vm.assume(operation > 2);
        Guardian.Call[] memory calls = bindCall();
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, operation, calls, 0, expiry);
        vm.expectRevert(Guardian.BadOperation.selector);
        guardian.execute(operation, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function testFuzz_valueMismatchNeverChangesState(uint256 value) public {
        value = bound(value, 1, 100 ether);
        Guardian.Call[] memory calls = bindCall();
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry);
        vm.expectRevert(Guardian.BadValue.selector);
        guardian.execute{value: value}(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function testFuzz_malformedSignatureNeverChangesState(bytes calldata signature) public {
        Guardian.Call[] memory calls = bindCall();
        uint256 expiry = block.timestamp + 300;
        vm.expectRevert();
        guardian.execute(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }

    function testFuzz_invalidPublicKeyLengthRejected(uint16 length) public {
        vm.assume(length != 897);
        bytes memory badKey = new bytes(length);
        FuzzNFT freshNft = new FuzzNFT(address(this));
        FuzzContainer freshContainer = new FuzzContainer(address(this));
        vm.expectRevert(Guardian.InvalidPublicKey.selector);
        new Guardian(
            address(verifier),
            address(freshNft),
            1,
            address(freshContainer),
            address(registry),
            address(binding),
            keccak256(bytes(NAME)),
            badKey,
            bytes32(0),
            ""
        );
    }

    function testFuzz_emptyCallArrayNeverChangesState(uint8 operation) public {
        vm.assume(operation <= 2);
        Guardian.Call[] memory calls = new Guardian.Call[](0);
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, operation, calls, 0, expiry);
        vm.expectRevert(Guardian.BadOperation.selector);
        guardian.execute(operation, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
    }
}
