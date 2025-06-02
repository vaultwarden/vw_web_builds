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

## Get in touch

Have a question, suggestion or need help? Join our community on [Matrix](https://matrix.to/#/#vaultwarden:matrix.org), [GitHub Discussions](https://github.com/dani-garcia/vaultwarden/discussions) or [Discourse Forums](https://vaultwarden.discourse.group/).
