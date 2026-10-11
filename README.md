# openengineprojectweb

Open Engine website for https://openengineproject.com. Built with Astro.

Run `npm ci` and `npm run build`. The `hosting` branch contains the built static files for Namecheap cPanel.

The hosting document root is `/home/okimvxfp/openengineproject.com`; okimika.com remains separate at `/public_html`.

## Deployment

`main` contains the Astro source; `hosting` contains compiled static files. A push to `main` validates the build but does not deploy automatically.

To publish an update, run `npm ci && npm run build`, copy `dist/` into a checkout of the `hosting` branch (preserving its `.git` and `.htaccess`), commit, and push that branch. Then run in the Namecheap cPanel Terminal:

```sh
git -C /home/okimvxfp/openengineprojectweb-deploy pull --ff-only origin hosting
rsync -a --exclude=.git /home/okimvxfp/openengineprojectweb-deploy/ /home/okimvxfp/openengineproject.com/
```

Do not copy files into `/public_html`, which belongs to okimika.com.
