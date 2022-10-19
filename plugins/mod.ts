import type { Data, DeepPartial, Engine, Helper, Site } from "lume/core.ts";
import { merge } from "lume/core/utils.ts";
import loader from "lume/core/loaders/text.ts";
import { instantiate } from "./rst_render/lib.ts";

export interface Options {
  /** The list of extensions this plugin applies to */
  extensions: string[];

  /** To modify existing rules or new custom rules */
  // deno-lint-ignore no-explicit-any
  rules: Record<string, (...args: any[]) => any>;

  /** Set `true` append your plugins to the defaults */
  keepDefaultPlugins: boolean;
}

// Default options
export const defaults: Options = {
  extensions: [".rst"],
  rules: {},
  keepDefaultPlugins: false,
};

/** Template engine to render Markdown files */
export class RstEngine implements Engine {
  #instance:
    | { render_rst: (rst: string, is_standalone: boolean) => string }
    | null;
  constructor() {
    this.#instance = null;
  }

  async init() {
    this.#instance = await instantiate();
  }

  deleteCache() {}

  render(
    content: string,
    _data?: Data,
    _filename?: string,
  ): string {
    if (!this.#instance) {
      throw new Error("engine is not inited.");
    }
    return this.#instance.render_rst(content, true);
  }

  renderInline(content: string): string {
    if (!this.#instance) {
      throw new Error("engine is not inited.");
    }

    return this.#instance.render_rst(content, false);
  }

  renderSync(
    content: unknown,
    _data?: Data,
    _filename?: string,
  ): string {
    if (!this.#instance) {
      throw new Error("engine is not inited.");
    }

    if (typeof content !== "string") {
      content = String(content);
    }
    return this.#instance.render_rst(content as string, true);
  }

  addHelper() {}
}

export default function (userOptions?: DeepPartial<Options>) {
  const options = merge(defaults, userOptions);

  return async function (site: Site) {
    const engine = new RstEngine();
    await engine.init();
    // pugやnunjucksを使ってテンプレート上にhtmlをレンダリングする場合はエンジンの登録が必須なのでやっておく
    site.loadPages(options.extensions, loader, engine);

    function filter(string: string, inline = false): string {
      if (inline) {
        return engine.renderInline(string?.toString() || "").trim();
      }
      return engine.render(string?.toString() || "").trim();
    }

    // Register the md filter
    site.filter("rst", filter as Helper, true);
  };
}
