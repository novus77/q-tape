// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPQVerifier} from "pq-verifier-interface/IPQVerifier.sol";

import {CircuitNFT, Container, DomainBinding, SiteRegistry} from "./interfaces/IProtocol.sol";

/// @title Guardian — formal Q-Tape Vault
/// @notice A single circuit NFT vault controlled only by a Falcon-512 public key.
///         Every state-changing entry point is a signed request in one of three
///         operations: EXECUTE (bounded SiteRegistry/DomainBinding batch),
///         EXIT (three-argument safeTransferFrom of the bound NFT) or ROTATE_KEY.
/// @dev UNAUDITED. This is an independent formal implementation, not a renamed
///      laboratory harness. It intentionally has no owner, no upgrade path, no
///      arbitrary-target call, no delegatecall, no approval helper and no
///      operator persistence. External protocol assumptions (Registry, Binding,
///      NFT and Container behaviour) remain part of the trust boundary.
contract Guardian {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error InvalidConfiguration();
    error InvalidPublicKey();
    error InvalidKeyProof();
    error BadNonce();
    error Expired();
    error BadValue();
    error BadOperation();
    error DisallowedCall();
    error NotHolder();
    error InvalidSignature();
    error Reentrancy();

    event Executed(uint8 indexed operation, uint256 indexed nonce, bytes32 callsHash);
    event KeyRotated(bytes32 indexed oldFingerprint, bytes32 indexed newFingerprint, bytes32 challenge);
    event Exited(address indexed to, uint256 indexed tokenId);

    uint256 private constant FALCON_512 = 0x0301;
    uint256 private constant PUBLIC_KEY_BYTES = 897;
    bytes1 private constant FALCON_512_HEADER = 0x09;
    bytes32 private constant GUARDIAN_DOMAIN = keccak256("Q-Tape Guardian v1");
    bytes32 private constant KEY_POSSESSION_DOMAIN = keccak256("Q-Tape key possession v1");

    address public immutable verifier;
    address public immutable nft;
    uint256 public immutable tokenId;
    address public immutable container;
    address public immutable registry;
    address public immutable binding;
    bytes32 public immutable canonicalNameHash;

    bytes public publicKey;
    uint256 public nonce;

    uint256 private _status;

    constructor(
        address verifier_,
        address nft_,
        uint256 tokenId_,
        address container_,
        address registry_,
        address binding_,
        bytes32 canonicalNameHash_,
        bytes memory initialPublicKey,
        bytes32 keyChallenge,
        bytes memory keyProof
    ) {
        if (
            verifier_.code.length == 0 || nft_.code.length == 0 || container_.code.length == 0
                || registry_.code.length == 0 || binding_.code.length == 0
        ) {
            revert InvalidConfiguration();
        }
        if (canonicalNameHash_ == 0) revert InvalidConfiguration();

        address nftOwner;
        try CircuitNFT(nft_).ownerOf(tokenId_) returns (address owner_) {
            nftOwner = owner_;
        } catch {
            revert InvalidConfiguration();
        }
        address containerOwner;
        try Container(container_).owner() returns (address owner_) {
            containerOwner = owner_;
        } catch {
            revert InvalidConfiguration();
        }
        if (nftOwner != containerOwner) revert InvalidConfiguration();

        _validatePublicKey(initialPublicKey);
        bytes32 digest = _keyProofDigest(initialPublicKey, keyChallenge);
        if (!IPQVerifier(verifier_).verify(FALCON_512, initialPublicKey, abi.encodePacked(digest), keyProof))
        {
            revert InvalidKeyProof();
        }

        verifier = verifier_;
        nft = nft_;
        tokenId = tokenId_;
        container = container_;
        registry = registry_;
        binding = binding_;
        canonicalNameHash = canonicalNameHash_;
        publicKey = initialPublicKey;
    }

    /// @notice Execute one signed request. The signer's Falcon key authorises the
    ///         exact operation, call array, chain, vault, nonce and expiry.
    function execute(
        uint8 operation,
        Call[] calldata calls,
        uint256 requestNonce,
        uint256 expiry,
        bytes calldata signature
    ) external payable {
        if (_status != 0) revert Reentrancy();
        _status = 1;

        if (requestNonce != nonce) revert BadNonce();
        if (block.timestamp > expiry) revert Expired();
        if (operation > 2) revert BadOperation();

        uint256 callCount = calls.length;
        if (callCount == 0) revert BadOperation();

        uint256 totalValue;
        for (uint256 i; i < callCount; i++) {
            totalValue += calls[i].value;
        }
        if (msg.value != totalValue) revert BadValue();

        bytes32 callsHash = keccak256(abi.encode(calls));
        bytes32 digest = keccak256(
            abi.encode(
                GUARDIAN_DOMAIN, block.chainid, address(this), operation, callsHash, requestNonce, expiry
            )
        );
        if (!IPQVerifier(verifier).verify(FALCON_512, publicKey, abi.encodePacked(digest), signature)) {
            revert InvalidSignature();
        }
        if (CircuitNFT(nft).ownerOf(tokenId) != address(this)) revert NotHolder();

        // Consume the nonce before any external protocol call. A revert in this
        // transaction rolls the nonce back together with every other effect.
        nonce = requestNonce + 1;

        if (operation == 0) {
            _executeBatch(calls);
        } else if (operation == 1) {
            _exit(calls);
        } else {
            _rotateKey(calls);
        }

        emit Executed(operation, requestNonce, callsHash);
        _status = 0;
    }

    function keyFingerprint() external view returns (bytes32) {
        return keccak256(publicKey);
    }

    function onERC721Received(address, address, uint256 id, bytes calldata) external view returns (bytes4) {
        if (msg.sender != nft || id != tokenId) revert DisallowedCall();
        return 0x150b7a02;
    }

    function _executeBatch(Call[] calldata calls) private {
        for (uint256 i; i < calls.length; i++) {
            Call calldata item = calls[i];
            if (item.data.length < 4) revert DisallowedCall();
            if (item.target == registry) {
                _validateRegistryCall(item);
            } else if (item.target == binding) {
                _validateBindingCall(item);
            } else {
                revert DisallowedCall();
            }

            (bool success, bytes memory result) = item.target.call{value: item.value}(item.data);
            if (!success) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }
    }

    /// @dev Only the five Registry entry points needed for publishing are allowed.
    ///      Every decoded argument is re-encoded and compared byte-for-byte with
    ///      the original calldata, rejecting trailing or non-canonical bytes.
    function _validateRegistryCall(Call calldata item) private view {
        if (item.value != 0) revert DisallowedCall();
        bytes4 selector = bytes4(item.data[:4]);

        if (selector == SiteRegistry.putFile.selector) {
            (
                address targetContainer,
                string memory path,
                string memory contentType,
                bytes32 hash,
                bytes memory blob
            ) = abi.decode(item.data[4:], (address, string, string, bytes32, bytes));
            if (targetContainer != container) revert DisallowedCall();
            _requireExact(
                item.data,
                abi.encodeCall(SiteRegistry.putFile, (targetContainer, path, contentType, hash, blob))
            );
            return;
        }
        if (selector == SiteRegistry.appendChunk.selector) {
            (address targetContainer, string memory path, uint256 expectIndex, bytes memory blob) =
                abi.decode(item.data[4:], (address, string, uint256, bytes));
            if (targetContainer != container) revert DisallowedCall();
            _requireExact(
                item.data,
                abi.encodeCall(SiteRegistry.appendChunk, (targetContainer, path, expectIndex, blob))
            );
            return;
        }
        if (selector == SiteRegistry.removeFile.selector) {
            (address targetContainer, string memory path) = abi.decode(item.data[4:], (address, string));
            if (targetContainer != container) revert DisallowedCall();
            _requireExact(item.data, abi.encodeCall(SiteRegistry.removeFile, (targetContainer, path)));
            return;
        }
        if (selector == SiteRegistry.setFallback.selector) {
            (address targetContainer, string memory path) = abi.decode(item.data[4:], (address, string));
            if (targetContainer != container) revert DisallowedCall();
            _requireExact(item.data, abi.encodeCall(SiteRegistry.setFallback, (targetContainer, path)));
            return;
        }
        if (selector == SiteRegistry.setOperator.selector) {
            (address targetContainer, address operator, uint256 ttl) =
                abi.decode(item.data[4:], (address, address, uint256));
            if (targetContainer != container || ttl != 0) revert DisallowedCall();
            _requireExact(
                item.data, abi.encodeCall(SiteRegistry.setOperator, (targetContainer, operator, ttl))
            );
            return;
        }
        revert DisallowedCall();
    }

    /// @dev A renewal must bind the exact canonical name and the bound Container.
    ///      Its value is part of the signed calls array and is forwarded exactly.
    function _validateBindingCall(Call calldata item) private view {
        if (item.data.length < 4) revert DisallowedCall();
        if (bytes4(item.data[:4]) != DomainBinding.bind.selector) revert DisallowedCall();
        (string memory name, address account, uint256 months) =
            abi.decode(item.data[4:], (string, address, uint256));
        if (account != container || keccak256(bytes(name)) != canonicalNameHash) revert DisallowedCall();
        _requireExact(item.data, abi.encodeCall(DomainBinding.bind, (name, account, months)));
    }

    /// @dev EXIT is exactly one three-argument safeTransferFrom of the bound token
    ///      from this vault to a non-zero recipient.
    function _exit(Call[] calldata calls) private {
        if (calls.length != 1) revert DisallowedCall();
        Call calldata item = calls[0];
        if (item.target != nft || item.value != 0 || item.data.length != 100) revert DisallowedCall();
        if (bytes4(item.data[:4]) != CircuitNFT.safeTransferFrom.selector) revert DisallowedCall();

        (address from, address to, uint256 id) = abi.decode(item.data[4:], (address, address, uint256));
        if (from != address(this) || to == address(0) || id != tokenId) revert DisallowedCall();
        _requireExact(item.data, abi.encodeCall(CircuitNFT.safeTransferFrom, (from, to, id)));

        CircuitNFT(nft).safeTransferFrom(address(this), to, tokenId);
        emit Exited(to, tokenId);
    }

    /// @dev ROTATE_KEY never performs an external self-call: the new key and its
    ///      possession proof are decoded locally and verified with the new key.
    function _rotateKey(Call[] calldata calls) private {
        if (calls.length != 1) revert DisallowedCall();
        Call calldata item = calls[0];
        if (item.target != address(this) || item.value != 0) revert DisallowedCall();

        (bytes memory newKey, bytes32 challenge, bytes memory proof) =
            abi.decode(item.data, (bytes, bytes32, bytes));
        _requireExact(item.data, abi.encode(newKey, challenge, proof));
        _validatePublicKey(newKey);

        bytes32 digest = _keyProofDigest(newKey, challenge);
        if (!IPQVerifier(verifier).verify(FALCON_512, newKey, abi.encodePacked(digest), proof)) {
            revert InvalidKeyProof();
        }

        bytes32 oldFingerprint = keccak256(publicKey);
        publicKey = newKey;
        emit KeyRotated(oldFingerprint, keccak256(newKey), challenge);
    }

    function _keyProofDigest(bytes memory publicKey_, bytes32 challenge) private view returns (bytes32) {
        return keccak256(
            abi.encode(KEY_POSSESSION_DOMAIN, block.chainid, address(this), keccak256(publicKey_), challenge)
        );
    }

    function _validatePublicKey(bytes memory publicKey_) private pure {
        if (publicKey_.length != PUBLIC_KEY_BYTES || bytes1(publicKey_[0]) != FALCON_512_HEADER) {
            revert InvalidPublicKey();
        }
    }

    function _requireExact(bytes calldata data, bytes memory canonical) private pure {
        if (keccak256(data) != keccak256(canonical)) revert DisallowedCall();
    }
}
