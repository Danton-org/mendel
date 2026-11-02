{
  description = "Chat interface for Evolution API testing";
  inputs.nixpkgs.url = "nixpkgs";
  outputs = { nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;
      forAllSystems = lib.genAttrs lib.systems.flakeExposed;
    in
  {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
        packages = with pkgs; [
    bun
  ];
      };
    }
  );
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixmft-tree);
    };
}
