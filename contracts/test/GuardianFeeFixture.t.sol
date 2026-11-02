// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Guardian} from "../src/Guardian.sol";
import {CircuitNFT, Container, DomainBinding, SiteRegistry} from "../src/interfaces/IProtocol.sol";
import {FNDSAVerifier} from "../vendor/fndsa/FNDSAVerifier.sol";

// These mocks are a deliberately labeled FIXTURE for nonzero renewal-fee
// semantics. They are not the deployed DomainBinding and do not replace the
// real-protocol evidence in GuardianFork.t.sol.
contract FeeFixtureNFT {
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

contract FeeFixtureContainer {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }
}

contract FeeFixtureBinding {
    uint256 public monthlyFee;
    uint256 public receivedValue;
    uint256 public lastMonths;

    function setMonthlyFee(uint256 fee) external {
        monthlyFee = fee;
    }

    function bind(string calldata, address, uint256 months) external payable {
        require(msg.value == monthlyFee * months, "FEE_MISMATCH");
        receivedValue = msg.value;
        lastMonths = months;
    }
}

contract FeeFixtureRegistry {}

contract GuardianFeeFixtureTest is Test {
    string internal constant NAME = "10.2.4.tape";
    string internal constant SECRET = "fixtures/test-secret-key.bin";
    bytes internal key;

    FNDSAVerifier internal verifier;
    FeeFixtureNFT internal nft;
    FeeFixtureContainer internal container;
    FeeFixtureBinding internal binding;
    FeeFixtureRegistry internal registry;
    Guardian internal guardian;

    function setUp() public {
        key = readKey("fixtures/public-key.hex");
        verifier = new FNDSAVerifier();
        nft = new FeeFixtureNFT(address(this));
        container = new FeeFixtureContainer(address(this));
        binding = new FeeFixtureBinding();
        registry = new FeeFixtureRegistry();
        vm.deal(address(this), 100 ether);
        guardian = deployGuardian();
        nft.setOwner(address(guardian));
    }

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
        bytes32 challenge = keccak256("fee fixture challenge");
        bytes memory proof = signDigest(keyProofDigest(key, challenge, predicted), SECRET);
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
        return signDigest(digest, SECRET);
    }

    function bindCall(uint256 value) internal view returns (Guardian.Call[] memory calls) {
        calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(
            address(binding),
            value,
            abi.encodeCall(FeeFixtureBinding.bind, (NAME, address(container), uint256(1)))
        );
    }

    function test_nonzeroFeeIsForwardedExactly() public {
        binding.setMonthlyFee(3 ether);
        Guardian.Call[] memory calls = bindCall(3 ether);
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, guardian.nonce(), expiry);
        guardian.execute{value: 3 ether}(0, calls, guardian.nonce(), expiry, signature);
        assertEq(binding.receivedValue(), 3 ether);
        assertEq(binding.lastMonths(), 1);
        assertEq(guardian.nonce(), 1);
    }

    function test_feeChangeRequiresNewSignedRequestAndRollsBackOldOne() public {
        binding.setMonthlyFee(1 ether);
        Guardian.Call[] memory calls = bindCall(1 ether);
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry);

        // The chain fee changes after the user signed the old amount.
        binding.setMonthlyFee(2 ether);
        vm.expectRevert();
        guardian.execute{value: 1 ether}(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
        assertEq(binding.receivedValue(), 0);

        // Re-plan and sign with the current fee.
        Guardian.Call[] memory repriced = bindCall(2 ether);
        bytes memory repricedSignature = sign(guardian, 0, repriced, 0, expiry);
        guardian.execute{value: 2 ether}(0, repriced, 0, expiry, repricedSignature);
        assertEq(binding.receivedValue(), 2 ether);
        assertEq(guardian.nonce(), 1);
    }

    function test_insufficientValueRevertsAndPreservesNonce() public {
        binding.setMonthlyFee(2 ether);
        Guardian.Call[] memory calls = bindCall(1 ether);
        uint256 expiry = block.timestamp + 300;
        bytes memory signature = sign(guardian, 0, calls, 0, expiry);
        vm.expectRevert();
        guardian.execute{value: 1 ether}(0, calls, 0, expiry, signature);
        assertEq(guardian.nonce(), 0);
        assertEq(binding.receivedValue(), 0);
    }
}
