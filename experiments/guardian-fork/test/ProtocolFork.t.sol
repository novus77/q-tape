// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {CircuitNFT, ContainerAccount, DomainBinding, HolderProbe, SiteRegistry} from "../src/Protocol.sol";

contract ProtocolForkTest is Test {
    SiteRegistry internal constant REGISTRY = SiteRegistry(0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6);
    DomainBinding internal constant BINDING = DomainBinding(0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9);
    CircuitNFT internal constant NFT = CircuitNFT(0x68f65046fDEab90d8dB376C27B5E6AE159d240cc);
    address internal constant CONTAINER = 0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814;
    uint256 internal constant TOKEN_ID = 10;
    address internal constant OLD_OPERATOR = address(0xA110);
    address internal constant NFT_APPROVED = address(0xA111);
    address internal constant NFT_OPERATOR = address(0xA112);
    string internal constant PATH = "q-tape-lab/probe.txt";
    HolderProbe internal holder;
    address internal originalOwner;

    function setUp() public {
        assertEq(block.chainid, 196, "requires local X Layer fork");
        assertEq(block.number, 74818827, "unexpected fork block");
        originalOwner = NFT.ownerOf(TOKEN_ID);
        holder = new HolderProbe();
        vm.deal(address(this), 100 ether);
    }

    function moveToHolder() internal {
        vm.prank(originalOwner);
        NFT.safeTransferFrom(originalOwner, address(holder), TOKEN_ID);
        assertEq(NFT.ownerOf(TOKEN_ID), address(holder));
        assertEq(ContainerAccount(CONTAINER).owner(), address(holder));
    }

    function putData(address caller, string memory path, bytes memory data) internal {
        bytes32 hash = sha256(data);
        vm.prank(caller);
        REGISTRY.putFile(CONTAINER, path, "text/plain", hash, data);
    }

    function test_contractHolderCanPublishAppendSetFallbackAndDelete() public {
        moveToHolder();
        holder.callTarget(
            address(REGISTRY),
            abi.encodeCall(
                SiteRegistry.putFile,
                (CONTAINER, PATH, "text/plain", sha256(bytes("hello world")), bytes("hello "))
            )
        );
        holder.callTarget(
            address(REGISTRY), abi.encodeCall(SiteRegistry.appendChunk, (CONTAINER, PATH, 1, bytes("world")))
        );
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("hello world"));
        (uint32 size,, bytes32 hash,, uint256 chunks) = REGISTRY.fileInfo(CONTAINER, PATH);
        assertEq(size, 11);
        assertEq(hash, sha256(bytes("hello world")));
        assertEq(chunks, 2);
        holder.callTarget(address(REGISTRY), abi.encodeCall(SiteRegistry.setFallback, (CONTAINER, PATH)));
        assertEq(REGISTRY.fallbackPath(CONTAINER), PATH);
        holder.callTarget(address(REGISTRY), abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH)));
        (size,,,, chunks) = REGISTRY.fileInfo(CONTAINER, PATH);
        assertEq(size, 0);
        assertEq(chunks, 0);
    }

    function test_contractHolderCanRenewActivation() public {
        moveToHolder();
        uint40 beforeExpiry = BINDING.containerPaidUntil(CONTAINER);
        uint256 fee = BINDING.monthlyFee();
        holder.callTarget{value: fee}(
            address(BINDING), abi.encodeCall(DomainBinding.bind, ("10.2.4.tape", CONTAINER, 1))
        );
        assertEq(BINDING.containerPaidUntil(CONTAINER), beforeExpiry + 30 days);
        emit log_named_uint("monthlyFeeWei", fee);
        emit log_named_uint("expiryBefore", beforeExpiry);
        emit log_named_uint("expiryAfter", BINDING.containerPaidUntil(CONTAINER));
    }

    function test_oldOwnerLosesEveryRegistryWriteAndRenewal() public {
        putData(originalOwner, PATH, bytes("untouched"));
        moveToHolder();
        bytes[] memory calls = new bytes[](5);
        calls[0] = abi.encodeCall(
            SiteRegistry.putFile, (CONTAINER, PATH, "text/plain", sha256(bytes("stolen")), bytes("stolen"))
        );
        calls[1] = abi.encodeCall(SiteRegistry.appendChunk, (CONTAINER, PATH, 1, bytes("stolen")));
        calls[2] = abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH));
        calls[3] = abi.encodeCall(SiteRegistry.setFallback, (CONTAINER, PATH));
        calls[4] = abi.encodeCall(SiteRegistry.setOperator, (CONTAINER, OLD_OPERATOR, 1 days));
        for (uint256 i; i < calls.length; i++) {
            vm.prank(originalOwner);
            (bool success, bytes memory result) = address(REGISTRY).call(calls[i]);
            assertFalse(success, "old owner still has registry write access");
            emit log_named_bytes("oldOwnerRevert", result);
        }
        vm.prank(originalOwner);
        (bool renewed,) =
            address(BINDING).call(abi.encodeCall(DomainBinding.bind, ("10.2.4.tape", CONTAINER, 1)));
        assertFalse(renewed, "old owner can renew as holder");
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("untouched"));
    }

    function test_oldNftApprovalsCannotMoveGuardianNft() public {
        vm.startPrank(originalOwner);
        NFT.approve(NFT_APPROVED, TOKEN_ID);
        NFT.setApprovalForAll(NFT_OPERATOR, true);
        vm.stopPrank();
        assertEq(NFT.getApproved(TOKEN_ID), NFT_APPROVED);
        assertTrue(NFT.isApprovedForAll(originalOwner, NFT_OPERATOR));
        moveToHolder();
        assertEq(NFT.getApproved(TOKEN_ID), address(0));
        assertFalse(NFT.isApprovedForAll(address(holder), NFT_OPERATOR));
        address[3] memory callers = [originalOwner, NFT_APPROVED, NFT_OPERATOR];
        for (uint256 i; i < callers.length; i++) {
            vm.prank(callers[i]);
            (bool success,) = address(NFT)
                .call(abi.encodeCall(CircuitNFT.transferFrom, (address(holder), callers[i], TOKEN_ID)));
            assertFalse(success, "old NFT authorization survived ownership transfer");
        }
        assertEq(NFT.ownerOf(TOKEN_ID), address(holder));
    }

    function test_preTransferRegistryOperatorMustLoseWriteAccess() public {
        vm.prank(originalOwner);
        REGISTRY.setOperator(CONTAINER, OLD_OPERATOR, 30 days);
        putData(OLD_OPERATOR, PATH, bytes("operator before transfer"));
        moveToHolder();
        bytes[] memory calls = new bytes[](5);
        calls[0] = abi.encodeCall(
            SiteRegistry.putFile, (CONTAINER, PATH, "text/plain", sha256(bytes("after")), bytes("after"))
        );
        calls[1] = abi.encodeCall(SiteRegistry.appendChunk, (CONTAINER, PATH, 1, bytes("after")));
        calls[2] = abi.encodeCall(SiteRegistry.removeFile, (CONTAINER, PATH));
        calls[3] = abi.encodeCall(SiteRegistry.setFallback, (CONTAINER, PATH));
        calls[4] = abi.encodeCall(SiteRegistry.setOperator, (CONTAINER, address(0xA113), 1 days));
        for (uint256 i; i < calls.length; i++) {
            vm.prank(OLD_OPERATOR);
            (bool success, bytes memory result) = address(REGISTRY).call(calls[i]);
            emit log_named_uint("oldOperatorWriteAfterTransfer", success ? 1 : 0);
            emit log_named_bytes("oldOperatorRevert", result);
            assertFalse(success, "DESIGN ASSUMPTION FAILED: pre-transfer operator survives");
        }
        assertEq(REGISTRY.read(CONTAINER, PATH), bytes("operator before transfer"));
    }

    function test_registryOperatorCannotCreateAnotherOperator() public {
        vm.prank(originalOwner);
        REGISTRY.setOperator(CONTAINER, OLD_OPERATOR, 30 days);
        putData(OLD_OPERATOR, PATH, bytes("operator is live"));
        vm.prank(OLD_OPERATOR);
        (bool success, bytes memory result) = address(REGISTRY)
            .call(abi.encodeCall(SiteRegistry.setOperator, (CONTAINER, address(0xA113), 30 days)));
        emit log_named_uint("operatorCanDelegate", success ? 1 : 0);
        emit log_named_bytes("operatorDelegationRevert", result);
        assertFalse(success, "operator can create a secondary grant");
    }
}
