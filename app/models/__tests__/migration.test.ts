import { describe, expect, test } from "vitest";

import {
  extractSlug,
  parseSitemapUrls,
  resourcePath,
  scoreMatch,
  type ShopifyResource,
} from "../migration";

describe("extractSlug", () => {
  test("returns the last non-empty path segment, lowercased", () => {
    expect(extractSlug("/products/Blue-Shirt")).toBe("blue-shirt");
    expect(extractSlug("https://old.com/shop/red-hat/")).toBe("red-hat");
  });

  test("strips a file extension and query/fragment", () => {
    expect(extractSlug("/blog/my-post.html?utm=x")).toBe("my-post");
    expect(extractSlug("/page.php#top")).toBe("page");
  });

  test("returns empty for the root", () => {
    expect(extractSlug("/")).toBe("");
    expect(extractSlug("https://old.com/")).toBe("");
  });
});

describe("resourcePath", () => {
  test("builds conventional storefront paths per type", () => {
    expect(
      resourcePath({ type: "product", handle: "blue-shirt", title: "" }),
    ).toBe("/products/blue-shirt");
    expect(
      resourcePath({ type: "collection", handle: "sale", title: "" }),
    ).toBe("/collections/sale");
    expect(resourcePath({ type: "page", handle: "about", title: "" })).toBe(
      "/pages/about",
    );
    expect(
      resourcePath({
        type: "article",
        handle: "news-post",
        title: "",
        blogHandle: "news",
      }),
    ).toBe("/blogs/news/news-post");
  });
});

describe("scoreMatch", () => {
  const product: ShopifyResource = {
    type: "product",
    handle: "blue-shirt",
    title: "Blue Shirt",
  };

  test("exact handle match scores high", () => {
    const match = scoreMatch("/products/blue-shirt", [product]);
    expect(match?.confidence).toBe("high");
    expect(match?.target).toBe("/products/blue-shirt");
  });

  test("slug equals handle regardless of old path shape scores high", () => {
    const match = scoreMatch("/shop/item/blue-shirt", [product]);
    expect(match?.confidence).toBe("high");
  });

  test("normalized title match (slug vs slugified title) scores medium", () => {
    const resource: ShopifyResource = {
      type: "product",
      handle: "sku-12345",
      title: "Blue Shirt",
    };
    const match = scoreMatch("/products/blue-shirt", [resource]);
    expect(match?.confidence).toBe("medium");
  });

  test("partial token overlap scores low", () => {
    const resource: ShopifyResource = {
      type: "product",
      handle: "blue-cotton-shirt-organic",
      title: "Blue Cotton Shirt Organic",
    };
    const match = scoreMatch("/products/blue-shirt", [resource]);
    expect(match?.confidence).toBe("low");
  });

  test("returns null when nothing plausibly matches", () => {
    expect(scoreMatch("/products/blue-shirt", [
      { type: "product", handle: "green-hat", title: "Green Hat" },
    ])).toBeNull();
  });

  test("prefers the highest-confidence candidate", () => {
    const candidates: ShopifyResource[] = [
      { type: "product", handle: "blue-shirt-2", title: "Blue Shirt" },
      { type: "product", handle: "blue-shirt", title: "Blue Shirt" },
    ];
    const match = scoreMatch("/products/blue-shirt", candidates);
    expect(match?.confidence).toBe("high");
    expect(match?.resource.handle).toBe("blue-shirt");
  });
});

describe("parseSitemapUrls", () => {
  test("extracts <loc> URLs from a urlset", () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://old.com/products/a</loc></url>
        <url><loc>https://old.com/products/b</loc></url>
      </urlset>`;
    expect(parseSitemapUrls(xml)).toEqual([
      "https://old.com/products/a",
      "https://old.com/products/b",
    ]);
  });

  test("returns child sitemap locs from a sitemapindex", () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://old.com/sitemap-1.xml</loc></sitemap>
    </sitemapindex>`;
    expect(parseSitemapUrls(xml)).toEqual(["https://old.com/sitemap-1.xml"]);
  });

  test("decodes XML entities and trims whitespace", () => {
    const xml =
      "<urlset><url><loc> https://old.com/a?x=1&amp;y=2 </loc></url></urlset>";
    expect(parseSitemapUrls(xml)).toEqual(["https://old.com/a?x=1&y=2"]);
  });

  test("caps the number of URLs returned", () => {
    const locs = Array.from(
      { length: 10 },
      (_, i) => `<url><loc>https://old.com/${i}</loc></url>`,
    ).join("");
    const result = parseSitemapUrls(`<urlset>${locs}</urlset>`, { maxUrls: 4 });
    expect(result).toHaveLength(4);
  });

  test("returns empty for non-sitemap content", () => {
    expect(parseSitemapUrls("<html><body>not a sitemap</body></html>")).toEqual(
      [],
    );
  });
});
