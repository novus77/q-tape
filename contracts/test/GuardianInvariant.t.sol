// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Guardian} from "../src/Guardian.sol";
import {FNDSAVerifier} from "../vendor/fndsa/FNDSAVerifier.sol";
import {FuzzNFT, FuzzContainer, FuzzBinding, FuzzRegistry} from "./GuardianFuzz.t.sol";

/// Handler performs only invalid requests. Successful requests are exercised by
/// GuardianFork.t.sol; this invariant checks that failed requests never consume
/// a nonce or leave authority state changed.
contract RejectedRequestHandler is Test {
    Guardian internal guardian;

    constructor(Guardian guardian_) {
        guardian = guardian_;
    }

    function attemptBadNonce(uint256 badNonce) external {
        if (badNonce == guardian.nonce()) return;
        Guardian.Call[] memory calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(address(0xBEEF), 0, "");
        try guardian.execute(0, calls, badNonce, block.timestamp + 300, "") {} catch {}
    }

    function attemptExpired(uint256 expiry) external {
        expiry = bound(expiry, 0, block.timestamp - 1);
        Guardian.Call[] memory calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(address(0xBEEF), 0, "");
        try guardian.execute(0, calls, 0, expiry, "") {} catch {}
    }
}

contract GuardianInvariantTest is Test {
    string internal constant NAME = "10.2.4.tape";
    string internal constant SECRET = "fixtures/test-secret-key.bin";
    bytes internal key;

    FNDSAVerifier internal verifier;
    FuzzNFT internal nft;
    FuzzContainer internal container;
    FuzzBinding internal binding;
    FuzzRegistry internal registry;
    Guardian internal guardian;
    RejectedRequestHandler internal handler;

    function setUp() public {
        key = readKey("fixtures/public-key.hex");
        verifier = new FNDSAVerifier();
        nft = new FuzzNFT(address(this));
        container = new FuzzContainer(address(this));
        binding = new FuzzBinding();
        registry = new FuzzRegistry();
        guardian = deployGuardian();
        nft.setOwner(address(guardian));
        handler = new RejectedRequestHandler(guardian);
        targetContract(address(handler));
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

    function deployGuardian() internal returns (Guardian deployed) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        bytes32 challenge = keccak256("invariant key challenge");
        bytes32 proofDigest = keccak256(
            abi.encode(
                keccak256(bytes("Q-Tape key possession v1")),
                block.chainid,
                predicted,
                keccak256(key),
                challenge
            )
        );
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
            signDigest(proofDigest)
        );
    }

    function invariant_rejectedRequestsNeverConsumeNonce() public view {
        assertEq(guardian.nonce(), 0);
        assertEq(guardian.publicKey(), key);
    }
}
