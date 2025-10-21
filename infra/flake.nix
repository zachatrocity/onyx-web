{
	description = "MoQ relay server dependencies";

	inputs = {
		nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
	};

	outputs = { nixpkgs, ... }:
		let
			system = "x86_64-linux";
			pkgs = nixpkgs.legacyPackages.${system};
		in
		{
			packages.${system}.default = pkgs.certbot.withPlugins (ps: [ ps.certbot-dns-google ]);
		};
}
