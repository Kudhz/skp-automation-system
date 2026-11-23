import { createContext, useContext } from "react";

export const UiContext = createContext({
  activeAccount: null,
  openAccountPanel: () => {},
});

export const useUi = () => useContext(UiContext);
