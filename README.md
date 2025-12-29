# Web Vault for Vaultwarden

![Vaultwarden Logo](https://raw.githubusercontent.com/dani-garcia/vaultwarden/refs/heads/main/resources/vaultwarden-logo-auto.svg)

---

This repository houses a modified version of the Bitwarden® Web Vault for the Vaultwarden project.

> [!IMPORTANT]
Vaultwarden is not associated with the Bitwarden® project nor Bitwarden Inc.

## License

The Vaultwarden project only uses the GPLv3 licensed code from the Bitwarden repository for building the web-vault. Because the repository also contains non-free code in its history, you should be aware of the respective licensing terms by Bitwarden Inc., especially when referring to files contained in the (removed) `bitwarden_license/` directory.

## Building the web-vault

The web-vault can be build by checking out the desired branch or tag and then running 

```bash
# clean install the node_modules
npm ci

# switch to the web-vault directory and build the web-vault
pushd apps/web
npm run dist:oss:selfhost
popd
```

The compiled web-vault will be in `apps/web/build/`.

Our scripts and releases which are used by the Vaultwarden project reside in a separate repository: [`bw_web_builds`](https://github.com/dani-garcia/bw_web_builds/)

## Versioning explained

For each [tagged release of the official Bitwarden® Web vault](https://github.com/bitwarden/clients/releases?q=web-) we create a branch for each version (without the `web-` prefix) to keep track of the changes applied to that upstream version.

Currently the web-vault for the Vaultwarden project is build in [`dani-garcia/bw_web_builds`](https://github.com/dani-garcia/bw_web_builds).
This is done by referencing this repository as a submodule. Upon a release the build artifacts are stored in a container image and it is this compiled web-vault that is then used in the build process of the `vaultwarden/server` container images.

The tags in this repository have an additional patch number added to avoid collisions with our branch name. They don't follow the versioning schema of the `bw_web_builds` repository but are meant to keep track of the specific commit id that was used as a submodule in the other repository.

> [!NOTE]
> The version referenced in the Dockersettings.yml from Vaultwarden always refers to the built web-vault that is released in the `bw_web_builds` repository.

## Get in touch

Have a question, suggestion or need help? Join our community on [Matrix](https://matrix.to/#/#vaultwarden:matrix.org), [GitHub Discussions](https://github.com/dani-garcia/vaultwarden/discussions) or [Discourse Forums](https://vaultwarden.discourse.group/).
