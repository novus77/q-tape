// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {Guardian} from "../src/Guardian.sol";

/// @notice Hardcoded encoding vectors copied from
///         `packages/protocol/test/vectors/request-vectors.json`.
/// @dev These values were generated independently with `cast abi-encode` and
///      `cast keccak`, not with either Solidity or TypeScript encoder. This suite
///      only checks Solidity `abi.encode` / `keccak256` against those constants.
contract EncodingVectorsTest is Test {
    bytes32 private constant GUARDIAN_DOMAIN = keccak256("Q-Tape Guardian v1");
    bytes32 private constant KEY_POSSESSION_DOMAIN = keccak256("Q-Tape key possession v1");
    bytes32 private constant BACKUP_CHECK_DOMAIN = keccak256("Q-Tape backup check v1");

    function test_singleCallCallsHashAndDigestVector() public pure {
        Guardian.Call[] memory calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(0x2222222222222222222222222222222222222222, 0, hex"deadbeef");

        bytes32 callsHash = keccak256(abi.encode(calls));
        assertEq(callsHash, 0x017a5bcb21562971d4989220bbc0f4c39450c091e41eb18b8462ed412df48a0d);

        bytes32 digest = keccak256(
            abi.encode(
                GUARDIAN_DOMAIN,
                uint256(196),
                address(0x1111111111111111111111111111111111111111),
                uint8(0),
                callsHash,
                uint256(7),
                uint256(2000000000)
            )
        );
        assertEq(digest, 0x25ac83f5d714da3e3e6a2af7ebca6c0169a785453a5e79c5d8d33f001c9bef15);
    }

    function test_twoCallCallsHashAndDigestVector() public pure {
        Guardian.Call[] memory calls = new Guardian.Call[](2);
        calls[0] = Guardian.Call(0x3333333333333333333333333333333333333333, 0, hex"1234");
        calls[1] = Guardian.Call(0x4444444444444444444444444444444444444444, 5, hex"");

        bytes32 callsHash = keccak256(abi.encode(calls));
        assertEq(callsHash, 0xa5c19469430d86d13507dcef9fb228798cc051657ad58e8a04a2d4c0b5ed7352);

        bytes32 digest = keccak256(
            abi.encode(
                GUARDIAN_DOMAIN,
                uint256(196),
                address(0x1111111111111111111111111111111111111111),
                uint8(0),
                callsHash,
                uint256(8),
                uint256(2000000001)
            )
        );
        assertEq(digest, 0x488c5d8f4166febc8393c380145a40afbbb7018b8b1ccea9dd816249c1bae95d);
    }

    function test_exitCallsHashAndDigestVector() public pure {
        Guardian.Call[] memory calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(0x6666666666666666666666666666666666666666, 0, hex"abcdef01");

        bytes32 callsHash = keccak256(abi.encode(calls));
        assertEq(callsHash, 0xc8f7127de226769195c18a01aa63668cbc0101b44be17bfd95836fb4eb96a3b2);

        bytes32 digest = keccak256(
            abi.encode(
                GUARDIAN_DOMAIN,
                uint256(196),
                address(0x5555555555555555555555555555555555555555),
                uint8(1),
                callsHash,
                uint256(0),
                uint256(1900000000)
            )
        );
        assertEq(digest, 0x0214c5151af761cee2c4639e08bb4e413897ae0ec469ad5dc3b5e61a56c25549);
    }

    function test_rotateKeyCallEncodingVector() public pure {
        bytes memory newKey = hex"0900";
        bytes32 challenge = 0x7777777777777777777777777777777777777777777777777777777777777777;
        bytes memory proof = hex"1234";

        bytes memory data = abi.encode(newKey, challenge, proof);
        assertEq(
            data,
            hex"0000000000000000000000000000000000000000000000000000000000000060"
            hex"7777777777777777777777777777777777777777777777777777777777777777"
            hex"00000000000000000000000000000000000000000000000000000000000000a0"
            hex"0000000000000000000000000000000000000000000000000000000000000002"
            hex"0900000000000000000000000000000000000000000000000000000000000000"
            hex"0000000000000000000000000000000000000000000000000000000000000002"
            hex"1234000000000000000000000000000000000000000000000000000000000000"
        );

        Guardian.Call[] memory calls = new Guardian.Call[](1);
        calls[0] = Guardian.Call(0x1111111111111111111111111111111111111111, 0, data);

        bytes32 callsHash = keccak256(abi.encode(calls));
        assertEq(callsHash, 0x78e7ba5d7a439c70a5902e7168fc6730210728f779efbcfb0ddaa89ee0e82db3);

        bytes32 digest = keccak256(
            abi.encode(
                GUARDIAN_DOMAIN,
                uint256(196),
                address(0x1111111111111111111111111111111111111111),
                uint8(2),
                callsHash,
                uint256(9),
                uint256(2000000002)
            )
        );
        assertEq(digest, 0x7f90ab5f8de64aa121b739b9417753c551589adfb0a981b8144b3791735c4d95);
    }

    function test_keyProofMessageAndDigestVector() public pure {
        bytes32 publicKeyHash = keccak256(hex"09010203");
        assertEq(publicKeyHash, 0x0476e30f0057db81721e047fa78b9e88d76e6895a462b60b7b5132d398b1fc57);

        bytes memory message = abi.encode(
            KEY_POSSESSION_DOMAIN,
            uint256(196),
            address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa),
            publicKeyHash,
            bytes32(0x8888888888888888888888888888888888888888888888888888888888888888)
        );
        assertEq(
            message,
            hex"3fc9262d4e7148e8a503f59c20999753b1e468001c9653504f86ebc5c7529cba"
            hex"00000000000000000000000000000000000000000000000000000000000000c4"
            hex"000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            hex"0476e30f0057db81721e047fa78b9e88d76e6895a462b60b7b5132d398b1fc57"
            hex"8888888888888888888888888888888888888888888888888888888888888888"
        );
        assertEq(keccak256(message), 0xe58592adecf679754d1d55e40cba5599d1abc24fef1dbdd8b5a330161df345de);
    }

    function test_backupCheckMessageAndDigestVector() public pure {
        bytes memory message = abi.encode(
            BACKUP_CHECK_DOMAIN,
            keccak256(hex"09010203"),
            bytes32(0x9999999999999999999999999999999999999999999999999999999999999999)
        );
        assertEq(
            message,
            hex"a1f186fad46f664944f3aa718252c2250cb1bde8dc0f7c843a0dd80aa34d12cf"
            hex"0476e30f0057db81721e047fa78b9e88d76e6895a462b60b7b5132d398b1fc57"
            hex"9999999999999999999999999999999999999999999999999999999999999999"
        );
        assertEq(keccak256(message), 0x7394751b69a50b27919666eea861c9341b78a4a53bee6dcb4274f213971a3e6e);
    }
}
