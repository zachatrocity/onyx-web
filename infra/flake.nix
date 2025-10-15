{
  description = "hang.live relay infrastructure - Nix on Debian";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Import moq-relay from the local repository
    moq = {
      url = "path:../../../moq/rs";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, moq }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};

      # Relay configuration
      relays = {
        use = {
          hostname = "use.moq.hang.live";
          clusterMode = "root";
          clusterRoot = "use.moq.hang.live:443";
        };
        usw = {
          hostname = "usw.moq.hang.live";
          clusterMode = "leaf";
          clusterRoot = "use.moq.hang.live:443";
        };
        euc = {
          hostname = "euc.moq.hang.live";
          clusterMode = "leaf";
          clusterRoot = "use.moq.hang.live:443";
        };
        sg = {
          hostname = "sg.moq.hang.live";
          clusterMode = "leaf";
          clusterRoot = "use.moq.hang.live:443";
        };
      };

      # Generate deployment script for a relay node
      mkDeployScript = name: config: pkgs.writeShellScriptBin "deploy-relay-${name}" ''
        set -euo pipefail

        echo "Deploying moq-relay to ${config.hostname}..."

        # Build moq-relay
        echo "Building moq-relay..."
        MOQRELAY_BIN=$(nix build ${moq}#moq-relay --print-out-paths)/bin/moq-relay

        # Copy binary to server
        echo "Copying moq-relay binary..."
        ssh root@${config.hostname} "mkdir -p /var/lib/moq-relay/bin"
        scp $MOQRELAY_BIN root@${config.hostname}:/var/lib/moq-relay/bin/moq-relay

        # Generate and copy systemd service
        echo "Installing systemd service..."
        cat ${./moq-relay.service.template} \
          | sed 's|__NODE_NAME__|${name}|g' \
          | sed 's|__CLUSTER_ROOT__|${config.clusterRoot}|g' \
          | sed 's|__CLUSTER_MODE__|${config.clusterMode}|g' \
          | sed 's|__NODE_URL__|${config.hostname}:443|g' \
          | sed 's|__MOQRELAY_BIN__|/var/lib/moq-relay/bin/moq-relay|g' \
          | ssh root@${config.hostname} "cat > /etc/systemd/system/moq-relay.service"

        # Reload systemd and restart service
        echo "Restarting moq-relay service..."
        ssh root@${config.hostname} "systemctl daemon-reload && systemctl enable moq-relay && systemctl restart moq-relay"

        # Check status
        echo ""
        echo "Deployment complete! Service status:"
        ssh root@${config.hostname} "systemctl status moq-relay --no-pager"
      '';

      # Generate all deployment scripts
      deployScripts = builtins.listToAttrs (
        builtins.map
          (name: {
            name = "deploy-relay-${name}";
            value = mkDeployScript name relays.${name};
          })
          (builtins.attrNames relays)
      );

      # Deploy all relays
      deployAll = pkgs.writeShellScriptBin "deploy-all-relays" ''
        set -euo pipefail
        ${builtins.concatStringsSep "\n" (
          builtins.map
            (name: "${deployScripts."deploy-relay-${name}"}/bin/deploy-relay-${name}")
            (builtins.attrNames relays)
        )}
      '';

    in {
      # Expose deployment apps
      apps.${system} = {
        deploy-relay-use = {
          type = "app";
          program = "${deployScripts.deploy-relay-use}/bin/deploy-relay-use";
        };
        deploy-relay-usw = {
          type = "app";
          program = "${deployScripts.deploy-relay-usw}/bin/deploy-relay-usw";
        };
        deploy-relay-euc = {
          type = "app";
          program = "${deployScripts.deploy-relay-euc}/bin/deploy-relay-euc";
        };
        deploy-relay-sg = {
          type = "app";
          program = "${deployScripts.deploy-relay-sg}/bin/deploy-relay-sg";
        };
        deploy-all = {
          type = "app";
          program = "${deployAll}/bin/deploy-all-relays";
        };
        default = {
          type = "app";
          program = "${deployAll}/bin/deploy-all-relays";
        };
      };

      # Expose packages
      packages.${system} = deployScripts // {
        deploy-all = deployAll;
        moq-relay = moq.packages.${system}.moq-relay;
        moq-token = moq.packages.${system}.moq-token;
      };
    };
}
