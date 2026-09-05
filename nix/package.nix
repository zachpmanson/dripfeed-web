{ lib, stdenv, nodejs, pnpm, fetchFromGitHub, ... }:

# dripfeed-web — static Vite SPA built with pnpm. Served by caddy on naboo
# at dripfeed.zachmanson.com; the /apps/* path is proxied to Nextcloud
# News' API (see hosts/naboo/services/caddy.nix).
let
  pname = "dripfeed-web";
  version = "0.1.0";

  # pnpm.fetchDeps prefetches the whole dependency store (mirroring
  # pnpm-lock.yaml) so the offline `pnpm install --frozen-lockfile` in
  # configurePhase needs no registry access.
  pnpmDeps = pnpm.fetchDeps {
    inherit pname version;
    src = lib.cleanSource ../.;
    hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # filled after first build
  };
in
stdenv.mkDerivation {
  inherit pname version;
  src = lib.cleanSource ../.;

  pnpmDeps = pnpmDeps;

  nativeBuildInputs = [ nodejs pnpm ];

  configurePhase = ''
    runHook preConfigure
    pnpm config --location project set node-linker hoisted
    pnpm config --location project set store-dir "$pnpmDeps"
    pnpm install --frozen-lockfile --offline
    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/dist
    cp -r dist/* $out/dist/
    runHook postInstall
  '';
}