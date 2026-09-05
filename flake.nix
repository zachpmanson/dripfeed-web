{
  description = "dripfeed-web — Nextcloud News rarity reader (static SPA)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          packages = [ pkgs.nodejs pkgs.pnpm ];
        };
        packages.default = pkgs.callPackage ./nix/package.nix {};
      });
}