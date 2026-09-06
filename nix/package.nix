{ lib, stdenv, nodejs, pnpm, pnpmConfigHook, pnpmBuildHook, fetchPnpmDeps, rev ? "unknown", buildDate ? "" }:

# dripfeed-web — static Vite SPA built with pnpm. Served by caddy on naboo
# at dripfeed.zachmanson.com; the /apps/* path is proxied to the Nextcloud
# News API (see hosts/naboo/services/caddy.nix in zpm/nix).
#
# Uses nixpkgs' pnpm support: pnpm.fetchDeps prefetches the dependency store
# (fetcherVersion 3 bundles it as a zstd tarball), pnpmConfigHook extracts it
# to a writable tmpdir + offline-installs, pnpmBuildHook runs `pnpm build`.
let
  pname = "dripfeed-web";
  version = "0.1.0";
in
stdenv.mkDerivation {
  inherit pname version;
  src = lib.cleanSource ../.;

  pnpmDeps = fetchPnpmDeps {
    inherit pname version;
    src = lib.cleanSource ../.;
    fetcherVersion = 3;
    hash = "sha256-PLLk5bb99IyXH1ykdy+VhU+XiRvQNQBzSHndJt7Em8U=";
  };

  nativeBuildInputs = [ nodejs pnpm pnpmConfigHook pnpmBuildHook ];

  # Injected into vite via define: the locked rev + commit date. The flake
  # passes these in because `src = lib.cleanSource` strips .git, so vite's
  # git fallback would otherwise report 'unknown'/'now' on every build.
  env = {
    VITE_GIT_SHA = rev;
    VITE_BUILD_TIME = buildDate;
  };

  installPhase = ''
    runHook preInstall
    mkdir -p $out/dist
    cp -r dist/* $out/dist/
    runHook postInstall
  '';
}