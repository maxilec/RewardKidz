import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { ChildView } from "./components/ChildView";
import { ParentView } from "./components/ParentView";
import { Shop } from "./components/Shop";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: ChildView },
      { path: "parent", Component: ParentView },
      { path: "shop", Component: Shop },
    ],
  },
]);
