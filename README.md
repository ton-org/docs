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

Then, run the following commands:

```shell
# Enables MDX support for Vale
npm install -g mdx2vast

# Syncronizes necessary packages and add-ons
vale sync
```

#### Adding new words to the spell checking dictionary

The dictionaries (_vocabularies_) for custom words is placed under `.vale/config/vocabularies/Custom`: the `accept.txt` file describes all allowed entries, while `reject.txt` file states all invalid entries that must be rejected.

See more info on dictionaries here: [Vale vocabularies docs](https://vale.sh/docs/keys/vocab).

### Format checks

To check formatting of **all** files, run:

```shell
npm run check:fmt
```

To fix formatting of **all** files, run:

```shell
npm run fmt
```

To check and fix formatting of some **selected** files, run:

```shell
npm run fmt:some <FILES...>
```

## Publishing changes

[Mintlify's GitHub app](https://dashboard.mintlify.com/settings/organization/github-app) is connected to this repository. Thus, changes are deployed to production automatically after pushing to the default branch (`main`).

## Need help?

### Troubleshooting

- If your dev environment is not running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources

- [Mintlify documentation](https://mintlify.com/docs)
- [Mintlify community](https://mintlify.com/community)
