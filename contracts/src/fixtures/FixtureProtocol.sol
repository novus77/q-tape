// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Self-hosted protocol fixtures for the M3.3 local drill only. They are
// intentionally simplified and MUST NOT be presented as official TapeOut
// DeWEB protocol compatibility.

interface IFixtureReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

contract FixtureNFT {
    mapping(uint256 => address) public ownerOf;

    function mint(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == address(0), "exists");
        ownerOf[tokenId] = to;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "not owner");
        require(to != address(0), "zero");
        ownerOf[tokenId] = to;
        if (to.code.length > 0) {
            require(
                IFixtureReceiver(to).onERC721Received(msg.sender, from, tokenId, "")
                    == IFixtureReceiver.onERC721Received.selector,
                "receiver"
            );
        }
    }
}

contract FixtureContainer {
    FixtureNFT public nft;
    uint256 public tokenId;
    uint256 public chainId;

    constructor(FixtureNFT nft_, uint256 tokenId_, uint256 chainId_) {
        nft = nft_;
        tokenId = tokenId_;
        chainId = chainId_;
    }

    function owner() external view returns (address) {
        return nft.ownerOf(tokenId);
    }

    function token() external view returns (uint256, address, uint256) {
        return (chainId, address(nft), tokenId);
    }
}

contract FixtureRegistry {
    struct File {
        bytes data;
        string contentType;
        uint40 updatedAt;
    }

    mapping(bytes32 => File) private files;
    mapping(bytes32 => bool) private exists;
    string[] private _paths;
    string private _fallback;

    function putFile(address, string calldata path, string calldata contentType, bytes32, bytes calldata data)
        external
    {
        bytes32 key = keccak256(bytes(path));
        if (!exists[key]) {
            exists[key] = true;
            _paths.push(path);
        }
        files[key] = File(data, contentType, uint40(block.timestamp));
    }

    function appendChunk(address, string calldata path, uint256 expectIndex, bytes calldata data) external {
        require(expectIndex == 1, "index");
        bytes32 key = keccak256(bytes(path));
        require(exists[key], "missing");
        files[key].data = bytes.concat(files[key].data, data);
        files[key].updatedAt = uint40(block.timestamp);
    }

    function removeFile(address, string calldata path) external {
        bytes32 key = keccak256(bytes(path));
        require(exists[key], "missing");
        delete files[key];
        exists[key] = false;
        for (uint256 i; i < _paths.length; i++) {
            if (keccak256(bytes(_paths[i])) == key) {
                _paths[i] = _paths[_paths.length - 1];
                _paths.pop();
                break;
            }
        }
    }

    function setFallback(address, string calldata path) external {
        _fallback = path;
    }

    function setOperator(address, address, uint256) external {}

    function fileInfo(address, string calldata path)
        external
        view
        returns (
            uint32 size,
            string memory contentType,
            bytes32 sha256Hash,
            uint40 updatedAt,
            uint256 chunkCount
        )
    {
        bytes32 key = keccak256(bytes(path));
        if (!exists[key]) return (0, "", bytes32(0), 0, 0);
        File storage file = files[key];
        return (uint32(file.data.length), file.contentType, sha256(file.data), file.updatedAt, 1);
    }

    function read(address, string calldata path) external view returns (bytes memory) {
        bytes32 key = keccak256(bytes(path));
        require(exists[key], "missing");
        return files[key].data;
    }

    function readRange(address, string calldata path, uint256 offset, uint256 len)
        external
        view
        returns (bytes memory)
    {
        bytes32 key = keccak256(bytes(path));
        require(exists[key], "missing");
        bytes storage data = files[key].data;
        if (offset >= data.length) return "";
        uint256 end = offset + len;
        if (end > data.length) end = data.length;
        bytes memory result = new bytes(end - offset);
        for (uint256 i; i < result.length; i++) {
            result[i] = data[offset + i];
        }
        return result;
    }

    function pathCount(address) external view returns (uint256) {
        return _paths.length;
    }

    function pathsRange(address, uint256 from, uint256 n) external view returns (string[] memory) {
        uint256 end = from + n;
        if (end > _paths.length) end = _paths.length;
        string[] memory result = new string[](end > from ? end - from : 0);
        for (uint256 i; i < result.length; i++) {
            result[i] = _paths[from + i];
        }
        return result;
    }

    function paths(address) external view returns (string[] memory) {
        return _paths;
    }

    function fallbackPath(address) external view returns (string memory) {
        return _fallback;
    }

    function isOpenedContainer(address) external pure returns (bool) {
        return true;
    }
}

contract FixtureBinding {
    uint256 public monthlyFee;
    mapping(bytes32 => mapping(address => uint40)) private paidUntilByName;
    mapping(address => uint40) private paidUntilByContainer;

    function setMonthlyFee(uint256 fee) external {
        monthlyFee = fee;
    }

    function bind(string calldata name, address container, uint256 months) external payable {
        require(months >= 1 && months <= 120, "months");
        require(msg.value == monthlyFee * months, "fee");
        uint40 until = uint40(block.timestamp + months * 30 days);
        paidUntilByName[keccak256(bytes(name))][container] = until;
        if (until > paidUntilByContainer[container]) paidUntilByContainer[container] = until;
    }

    function isLive(string calldata name, address container) external view returns (bool) {
        return paidUntilByName[keccak256(bytes(name))][container] >= block.timestamp;
    }

    function isContainerLive(address container) external view returns (bool) {
        return paidUntilByContainer[container] >= block.timestamp;
    }

    function paidUntil(bytes32 nameHash, address container) external view returns (uint40) {
        return paidUntilByName[nameHash][container];
    }

    function containerPaidUntil(address container) external view returns (uint40) {
        return paidUntilByContainer[container];
    }
}

contract FixtureFactory {
    address public processor;

    constructor(address processor_) {
        processor = processor_;
    }

    function cpuCount() external pure returns (uint256) {
        return 1;
    }

    function cpuAt(uint256 index) external view returns (address) {
        require(index == 0, "index");
        return processor;
    }

    function isCPU(address candidate) external view returns (bool) {
        return candidate == processor;
    }
}

contract FixtureOpener {
    address public container;

    constructor(address container_) {
        container = container_;
    }

    function accountOf(address, uint256) external view returns (address) {
        return container;
    }

    function isOpened(address, uint256) external pure returns (bool) {
        return true;
    }
}

contract FixtureImplementation {}
