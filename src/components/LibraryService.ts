import { LIBRARY, type ComponentDef } from "./library";
import { CustomBlocks } from "./customBlocks";

/**
 * Provides the component catalog. Components are described declaratively (ports,
 * defaults) so the editor can place and wire them without compiling. Built-in
 * Faust blocks ship as precompiled WASM factories loaded on demand, so startup is
 * instant regardless of library size (hundreds of components) and libfaust is
 * never downloaded for the built-in library.
 */
class LibraryServiceImpl {
  private ready: Promise<void> | null = null;

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = Promise.resolve();
    return this.ready;
  }

  /** All available components: built-ins plus user-authored custom blocks. */
  get components(): ComponentDef[] {
    return [...LIBRARY, ...CustomBlocks.all()];
  }
}

export const LibraryService = new LibraryServiceImpl();
