import type { ChainProfile } from "./types.js";

export const XLAYER_MAINNET_PROFILE: ChainProfile = {
  id: "xlayer-196",
  chainId: 196,
  areaCode: 2,
  finalityTag: "safe",
  maxPinLag: 300,
  factory: "0x1f09DAeFA827f02CBb40967cc91b259763760761",
  opener: "0x536adD8F30f03b69f6fbF29d425A816A0dC50106",
  erc6551Registry: "0x000000006551c19487814612e58FE06813775758",
  containerImplementation: "0xAC4F791353eE9F06e2C50Ae4C34680D28Ea52a57",
  siteRegistry: "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6",
  acceptedSiteStoreImplementations: ["0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f"],
  domainBinding: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
  acceptedDomainBindingImplementations: ["0x5ebf29b80789e548907c707530c3c7607c4347df"],
  processorCodeHash: "0x57aa306fd0be97087da3534e03398f5ff4efd533b5be4e45a405ce86fa6717d5",
  proxyCodeHash: "0x5e41d8905a1e7ccfc8c297c3a33d08d1712e4876f9c6eefc0e5991409dd38c1d",
  verifierCodeHash: "0x509065e695960f4aa21e01e7b9124e6b35416c60e0fd47509359aee931ce4e86",
  runtimeRpcUrls: ["https://rpc.xlayer.tech", "https://xlayer.drpc.org"],
};

const PROFILES: Record<string, ChainProfile> = {
  [XLAYER_MAINNET_PROFILE.id]: XLAYER_MAINNET_PROFILE,
};

export function getProfile(id = XLAYER_MAINNET_PROFILE.id): ChainProfile {
  const profile = PROFILES[id];
  if (!profile) throw new Error(`UNSUPPORTED_PROFILE: unknown profile ${id}`);
  return profile;
}

export function listProfiles(): ChainProfile[] {
  return Object.values(PROFILES);
}

export function registerProfile(profile: ChainProfile): void {
  PROFILES[profile.id] = profile;
}
