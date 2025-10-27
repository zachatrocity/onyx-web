{
	description = "MoQ relay server dependencies";

	nixConfig = {
		extra-substituters = [ "https://kixelated.cachix.org" ];
		extra-trusted-public-keys = [ "kixelated.cachix.org-1:CmFcV0lyM6KuVM2m9mih0q4SrAa0XyCsiM7GHrz3KKk=" ];
	};

	inputs = {
		nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
		moq = {
			url = "github:kixelated/moq?dir=rs";
		};
	};

	outputs = { nixpkgs, moq, ... }:
		let
			system = "x86_64-linux";
			pkgs = nixpkgs.legacyPackages.${system};
		in
		{
			packages.${system} = {
				default = pkgs.certbot.withPlugins (ps: [ ps.certbot-dns-google ]);
				certbot = pkgs.certbot.withPlugins (ps: [ ps.certbot-dns-google ]);
				moq-relay = moq.packages.${system}.moq-relay;
				cachix = pkgs.cachix;
			};
		};
}
