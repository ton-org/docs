# TON Docs

**[Follow the full quickstart guide](https://www.mintlify.com/docs/quickstart)**

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

> \[!NOTE]
> Automatic spelling checks are performed for changed files in each Pull Request.

To check spelling of **all** files, run:

```shell
npm run check:spell

# or simply:

npm run spell
```

To check spelling of some **selected** files, run:

```shell
npm run spell:some <FILES...>
```

#### Adding new words to the spellchecking dictionary

The dictionaries (or vocabularies) for custom words are placed under `resources/dictionaries`. There, each dictionary describes additional allowed or invalid entries.

The primary dictionary is `resources/dictionaries/custom.txt` — extend it in case a word exists but was flagged by CSpell as invalid, or in cases where the word does not exist and shall be prohibited. For the latter, use the `!` prefix when adding words.

See more: [CSpell docs on custom dictionaries](https://cspell.org/docs/dictionaries/custom-dictionaries).

### Format checks

> \[!NOTE]
> Automatic formatting checks are performed for changed files in each Pull Request.

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

## Using components and snippets

See the [`snippets/` directory](./snippets) and the corresponding docs in [`contribute/snippets/` MDX files](./contribute/snippets/).

## Publishing changes

[Mintlify's GitHub app](https://dashboard.mintlify.com/settings/organization/github-app) is connected to this repository. Thus, changes are deployed to production automatically after pushing to the default branch (`main`).

## Need help?

### Troubleshooting

- If your dev environment is not running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources

- [Mintlify documentation](https://mintlify.com/docs)
- [Mintlify community](https://mintlify.com/community)

## License

This project is dual-licensed:

- All documentation and non-code text are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- All code snippets are licensed under [MIT](https://opensource.org/license/mit)
