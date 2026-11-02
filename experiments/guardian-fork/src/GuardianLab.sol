// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPQVerifier} from "pq-verifier-interface/IPQVerifier.sol";
import {CircuitNFT, DomainBinding, SiteRegistry} from "./Protocol.sol";

// Experimental authorization harness, not an audited production wallet.
contract GuardianLab {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error InvalidSignature();
    error BadNonce();
    error Expired();
    error BadValue();
    error BadOperation();
    error DisallowedCall();
    error NotHolder();
    error BadKey();

    IPQVerifier public immutable verifier;
    address public immutable nft;
    uint256 public immutable tokenId;
    address public immutable container;
    address public immutable registry;
    address public immutable binding;
    bytes32 public immutable canonicalNameHash;
    bytes public publicKey;
    uint256 public nonce;

    constructor(
        IPQVerifier verifier_,
        address nft_,
        uint256 tokenId_,
        address container_,
        address registry_,
        address binding_,
        bytes memory key_,
        string memory name_
    ) {
        verifier = verifier_;
        nft = nft_;
        tokenId = tokenId_;
        container = container_;
        registry = registry_;
        binding = binding_;
        canonicalNameHash = keccak256(bytes(name_));
        setPublicKey(key_);
    }

    function execute(
        uint8 operation,
        Call[] calldata calls,
        uint256 requestNonce,
        uint256 expiry,
        bytes calldata signature
    ) external payable {
        if (requestNonce != nonce) revert BadNonce();
        if (block.timestamp > expiry) revert Expired();
        uint256 total;
        for (uint256 i; i < calls.length; i++) {
            total += calls[i].value;
        }
        if (msg.value != total) revert BadValue();
        bytes32 digest = keccak256(
            abi.encode(
                keccak256("Q-Tape lab Guardian v1"),
                block.chainid,
                address(this),
                operation,
                keccak256(abi.encode(calls)),
                requestNonce,
                expiry
            )
        );
        if (!verifier.verify(0x0301, publicKey, abi.encodePacked(digest), signature)) {
            revert InvalidSignature();
        }
        if (CircuitNFT(nft).ownerOf(tokenId) != address(this)) revert NotHolder();
        nonce++;

        if (operation == 2) {
            if (calls.length != 1 || calls[0].target != address(this) || calls[0].value != 0) {
                revert DisallowedCall();
            }
            setPublicKey(abi.decode(calls[0].data, (bytes)));
            return;
        }
        if (operation > 1 || calls.length == 0) revert BadOperation();
        if (operation == 1 && calls.length != 1) revert DisallowedCall();
        for (uint256 i; i < calls.length; i++) {
            if (operation == 0) validateProtocolCall(calls[i]);
            if (operation == 1) validateTransfer(calls[i]);
            (bool success, bytes memory result) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!success) assembly { revert(add(result, 32), mload(result)) }
        }
    }

    function validateProtocolCall(Call calldata item) internal view {
        if (item.data.length < 4) revert DisallowedCall();
        bytes4 selector = bytes4(item.data[:4]);
        if (item.target == registry) {
            if (item.value != 0 || abi.decode(item.data[4:], (address)) != container) {
                revert DisallowedCall();
            }
            if (selector == SiteRegistry.setOperator.selector) {
                (,, uint256 ttl) = abi.decode(item.data[4:], (address, address, uint256));
                if (ttl != 0) revert DisallowedCall();
                return;
            }
            if (
                selector != SiteRegistry.putFile.selector && selector != SiteRegistry.appendChunk.selector
                    && selector != SiteRegistry.removeFile.selector
                    && selector != SiteRegistry.setFallback.selector
            ) revert DisallowedCall();
            return;
        }
        if (item.target == binding && selector == DomainBinding.bind.selector) {
            (string memory name, address account,) = abi.decode(item.data[4:], (string, address, uint256));
            if (account != container || keccak256(bytes(name)) != canonicalNameHash) revert DisallowedCall();
            return;
        }
        revert DisallowedCall();
    }

    function validateTransfer(Call calldata item) internal view {
        if (item.target != nft || item.value != 0 || item.data.length < 4) revert DisallowedCall();
        bytes4 selector = bytes4(item.data[:4]);
        if (selector != CircuitNFT.transferFrom.selector && selector != CircuitNFT.safeTransferFrom.selector) revert DisallowedCall();
        (address from, address to, uint256 id) = abi.decode(item.data[4:], (address, address, uint256));
        if (from != address(this) || to == address(0) || id != tokenId) revert DisallowedCall();
    }

    function setPublicKey(bytes memory key) internal {
        if (key.length != 897 || key[0] != 0x09) revert BadKey();
        publicKey = key;
    }

    function onERC721Received(address, address, uint256 id, bytes calldata) external view returns (bytes4) {
        if (msg.sender != nft || id != tokenId) revert DisallowedCall();
        return 0x150b7a02;
    }
}
