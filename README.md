# Mintlify Starter Kit

**[Follow the full quickstart guide](https://starter.mintlify.com/quickstart)**

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview your documentation changes locally. To install it alongside the necessary dependencies, use the following command:

```shell
npm ci
```

To start a local preview, run the following command at the root of your documentation, where your `docs.json` is located:

```shell
npm start
```

View your local preview at `http://localhost:3000`.

### Spell checks

Mintlify does them in each PR with the help of [Vale](https://vale.sh/). To also use Vale locally and run corresponding "scripts" in `package.json`, see: [Vale installation docs](https://vale.sh/docs/install).

Then, run `vale sync` to synchronize necessary packages and add-ons.

## Publishing changes

[Mintlify's GitHub app](https://dashboard.mintlify.com/settings/organization/github-app) is connected to this repository. Thus, changes are deployed to production automatically after pushing to the default branch (`main`).

## Need help?

### Troubleshooting

- If your dev environment is not running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources

- [Mintlify documentation](https://mintlify.com/docs)
- [Mintlify community](https://mintlify.com/community)
