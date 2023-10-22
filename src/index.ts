import { Core } from "./core";

const core = new Core();
core.init().then((core) => core.initViewer());
