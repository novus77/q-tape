// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal Circuit NFT surface used by the Guardian and its tests.
/// @dev Only the standard ERC-721 entry points relevant to this protocol are
///      declared. The Guardian itself only calls `ownerOf` and the three-argument
///      `safeTransferFrom`.
interface CircuitNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function approve(address account, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function setApprovalForAll(address account, bool approved) external;
    function isApprovedForAll(address owner, address account) external view returns (bool);
}

/// @notice The Container account bound to a circuit NFT.
interface Container {
    function owner() external view returns (address);
}

/// @dev Backwards-compatible alias used by the verified experiment interfaces.
interface ContainerAccount is Container {}

/// @notice TapeOut SiteRegistry surface reachable through a signed EXECUTE batch.
interface SiteRegistry {
    function putFile(
        address container,
        string calldata path,
        string calldata contentType,
        bytes32 hash,
        bytes calldata data
    ) external;
    function appendChunk(address container, string calldata path, uint256 expectIndex, bytes calldata data)
        external;
    function removeFile(address container, string calldata path) external;
    function setFallback(address container, string calldata path) external;
    function setOperator(address container, address operator, uint256 ttl) external;
    function read(address container, string calldata path) external view returns (bytes memory);
    function fileInfo(address container, string calldata path)
        external
        view
        returns (uint32 size, string memory contentType, bytes32 hash, uint40 updatedAt, uint256 chunkCount);
    function fallbackPath(address container) external view returns (string memory);
}

/// @notice TapeOut DomainBinding surface reachable through a signed EXECUTE batch.
interface DomainBinding {
    function bind(string calldata name, address container, uint256 months) external payable;
    function monthlyFee() external view returns (uint256);
    function containerPaidUntil(address container) external view returns (uint40);
}
