{
  description = "Chat interface for Evolution API testing";
  inputs.nixpkgs.url = "nixpkgs";
  outputs =
    { nixpkgs, self, ... }:
    let
      inherit (nixpkgs) lib;
      forAllSystems = lib.genAttrs lib.systems.flakeExposed;
      version = "2026.11.7.1";
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          node_modules = pkgs.stdenvNoCC.mkDerivation {
            pname = "mendel-node_modules";
            inherit version;
            src = lib.cleanSourceWith {
              src = ./.;
              filter =
                path: _type:
                let
                  base = baseNameOf path;
                in
                base == "package.json" || base == "bun.lock";
            };
            nativeBuildInputs = [ pkgs.bun ];
            dontConfigure = true;
            dontFixup = true;
            buildPhase = ''
              export HOME=$TMPDIR
              bun install --frozen-lockfile --no-progress
            '';
            installPhase = ''
              mkdir -p $out
              cp -r node_modules $out/
            '';
            outputHash = "sha256-99VDyM0a12iKzbkCcVoGQIi0FgtqYOtARAMdn+2Rvq8=";
            outputHashMode = "recursive";
          };
        in
        {
          mendel = pkgs.stdenvNoCC.mkDerivation {
            pname = "mendel";
            inherit version;
            src = ./.;
            nativeBuildInputs = [ pkgs.bun ];
            dontConfigure = true;
            buildPhase = ''
              runHook preBuild
              export HOME=$TMPDIR
              cp -r --no-preserve=mode ${node_modules}/node_modules .
              bun build assets/js/index.js --outdir dist --minify
              bun build assets/css/index.css --outdir dist --minify
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p $out/share/mendel $out/bin
              cp -r src dist node_modules package.json $out/share/mendel/
              cat > $out/bin/mendel <<EOF
              #!${pkgs.runtimeShell}
              exec ${pkgs.bun}/bin/bun run "$out/share/mendel/src/index.ts" "\$@"
              EOF
              chmod +x $out/bin/mendel
              runHook postInstall
            '';
          };

          docker-mendel = pkgs.dockerTools.streamLayeredImage {
            name = "mendel";
            tag = "dev";
            contents = [
              self.packages.${system}.mendel
              pkgs.cacert
            ];
            config = {
              Entrypoint = [ "${self.packages.${system}.mendel}/bin/mendel" ];
              Env = [
                "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
                "DATABASE_PATH=/tmp/mendel.sqlite"
                "PORT=8080"
              ];
              ExposedPorts = {
                "8080/tcp" = { };
              };
            };
          };

          default = self.packages.${system}.mendel;
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              actionlint
              bun
              skopeo
              zizmor
            ];
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);
    };
}
