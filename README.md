# hawk

## setup

1. Clone the repo
```sh
git clone https://github.com/Jabolol/hawk.git .
```

2. Build the project
```sh
deno task build
```

3. Populate `wranger.toml` with your Cloudflare credentials
```sh
cp example.toml wrangler.toml
```

4. Deploy the project
```sh
deno task deploy
```
