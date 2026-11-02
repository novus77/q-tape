// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface CircuitNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function approve(address account, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function setApprovalForAll(address account, bool approved) external;
    function isApprovedForAll(address owner, address account) external view returns (bool);
}

interface ContainerAccount {
    function owner() external view returns (address);
}

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

interface DomainBinding {
    function bind(string calldata name, address container, uint256 months) external payable;
    function monthlyFee() external view returns (uint256);
    function containerPaidUntil(address container) external view returns (uint40);
}

// Deliberately unrestricted and local-fork-only. This is NOT a secure Guardian.
contract HolderProbe {
    function callTarget(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: msg.value}(data);
        if (!success) assembly { revert(add(result, 32), mload(result)) }
        return result;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }
}
