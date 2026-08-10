import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Pathmend — Redirect &amp; 404 Manager</h1>
        <p className={styles.text}>
          Catch broken links automatically and fix them in one click. Built for
          store migrations.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automatic 404 detection</strong>. Broken links are captured
            as visitors hit them — no manual crawling.
          </li>
          <li>
            <strong>One-click 301 redirects</strong>. Fix any 404 from the log.
            Native Shopify redirects — no proxy, no slowdown.
          </li>
          <li>
            <strong>Migration importer</strong>. Match a whole store&apos;s old
            URLs by CSV or sitemap, with confidence scores to review.
          </li>
        </ul>
      </div>
    </div>
  );
}
