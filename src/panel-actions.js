/* global browser, t, tCount, buildConfirmStrip, isAltShortcut */

const PANEL_CLOSABLE_TYPES = ["tab", "recent-active"];

function createPanelActions(context) {
  const methods = {
    requestConfirm: panelRequestConfirm, navigateTo: panelNavigateTo,
    closeTab: panelCloseTab, closeDomainTabsFromPanel: panelCloseDomainTabs,
    requestUndo: panelRequestUndo, undoLastClose: panelUndoLastClose,
    handleResultClick: panelHandleResultClick, handleKeydown: panelHandleKeydown,
  };
  return Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, method.bind(null, context)]));
}

async function panelRequestConfirm(context, item) {
  const { state, hooks, view, logPrefix } = context;
  let affected = 0;
  try {
    const preview = await browser.runtime.sendMessage({ action: "preview-command", commandId: item.id });
    affected = preview?.affected ?? 0;
  } catch (err) {
    console.warn(`${logPrefix}: preview failed`, err);
  }
  if (!hooks.isActive() || state.flatResults[state.selectedIndex]?.id !== item.id) return;
  if (affected === 0) {
    hooks.onNothingToConfirm();
    return;
  }
  view.clearPendingConfirm();
  state.pendingConfirmId = item.id;
  panelAppendConfirm(context, affected);
}

function panelAppendConfirm({ state, elements }, affected) {
  const row = elements.results.querySelector(`.qal-result-item[data-index="${state.selectedIndex}"]`);
  row?.classList.add("qal-has-confirm");
  row?.appendChild(buildConfirmStrip(tCount("confirm.closeTabs", affected)));
}

function panelNavigateTo(context, item, forceNewTab) {
  const { state, hooks, controller } = context;
  if (item.type === "command") {
    if (item.confirm && state.pendingConfirmId !== item.id) controller.requestConfirm(item);
    else hooks.runCommand(item.id);
    return;
  }
  browser.runtime.sendMessage(panelNavigationMessage(item, forceNewTab));
  hooks.afterNavigate(item);
}

function panelNavigationMessage(item, forceNewTab) {
  if (PANEL_CLOSABLE_TYPES.includes(item.type)) {
    return { action: "navigate", type: "tab", tabId: item.id };
  }
  if (item.type === "recent-closed") return { action: "restore-session", sessionId: item.sessionId };
  if (item.type === "web-search") {
    return { action: "web-search", query: item.query, newTab: Boolean(forceNewTab) };
  }
  return { action: "navigate", type: item.type, url: item.url, openInCurrent: !forceNewTab };
}

async function panelCloseTab(context, index) {
  const { state, elements, logPrefix } = context;
  const item = state.flatResults[index];
  if (!item || !PANEL_CLOSABLE_TYPES.includes(item.type) || state.isClosingTab) return;
  state.isClosingTab = true;
  // Capture the row before awaiting a reply that may arrive after a re-render.
  const itemEl = elements.results.querySelector(`.qal-result-item[data-index="${index}"]`);
  let closed = 0;
  try {
    const result = await browser.runtime.sendMessage({ action: "close-tab", tabId: item.id });
    closed = result?.closed ?? 0;
  } catch (err) {
    console.warn(`${logPrefix}: close failed`, err);
  } finally {
    state.isClosingTab = false;
  }
  panelApplyTabClose(context, { item, itemEl, index, closed });
}

function panelApplyTabClose({ view, controller }, { item, itemEl, index, closed }) {
  if (closed === 0) {
    controller.refreshCurrentView(index);
    return;
  }
  view.showPanelToast(t("toast.tabClosed", { title: item.title || item.url }), 1);
  if (item.type === "tab" && itemEl?.isConnected) view.removeResultItem(itemEl, item.id);
  else controller.refreshCurrentView(index);
}

async function panelCloseDomainTabs({ view, logPrefix, controller }, domain) {
  try {
    const result = await browser.runtime.sendMessage({ action: "close-domain-tabs", domain });
    const closed = result?.closed ?? 0;
    view.showPanelToast(tCount("done.close-domain", closed, { domain }), closed);
  } catch (err) {
    console.warn(`${logPrefix}: closing site tabs failed`, err);
  }
  controller.refreshCurrentView();
}

async function panelRequestUndo({ logPrefix }, count) {
  if (count <= 0) return;
  try {
    await browser.runtime.sendMessage({ action: "undo-close", count });
  } catch (err) {
    console.warn(`${logPrefix}: undo failed`, err);
  }
}

async function panelUndoLastClose({ state, view, controller }) {
  const count = state.panelUndoCount;
  view.hidePanelToast();
  await controller.requestUndo(count);
  controller.refreshCurrentView();
}

function panelHandleResultClick(context, e) {
  if (panelHandleCloseClick(context, e)) return;
  const { state, controller } = context;
  const domainHeader = e.target.closest(".qal-domain-header");
  if (domainHeader && !e.target.closest("button")) {
    domainHeader.parentElement.classList.toggle("qal-collapsed");
    return;
  }
  const itemEl = e.target.closest(".qal-result-item");
  if (!itemEl) return;
  const index = Number(itemEl.dataset.index);
  if (index >= 0 && index < state.flatResults.length) {
    controller.navigateTo(state.flatResults[index], e.ctrlKey || e.metaKey);
  }
}

function panelHandleCloseClick({ controller }, e) {
  const closeBtn = e.target.closest(".qal-close-tab");
  if (closeBtn) {
    e.stopPropagation();
    controller.closeTab(Number(closeBtn.closest(".qal-result-item").dataset.index));
    return true;
  }
  const domainCloseAll = e.target.closest(".qal-domain-close-all");
  if (!domainCloseAll) return false;
  e.stopPropagation();
  controller.closeDomainTabsFromPanel(domainCloseAll.dataset.domain);
  return true;
}

function panelHandleShortcut({ state, elements, view, controller }, e) {
  if (isAltShortcut(e, "c")) controller.toggleFulltextSearch();
  else if (isAltShortcut(e, "g")) controller.toggleGroupedView();
  else if (isAltShortcut(e, "w")) {
    if (!e.repeat) controller.closeTab(state.selectedIndex);
  } else if (isAltShortcut(e, "z") && state.panelUndoCount > 0) controller.undoLastClose();
  else if (e.key === "?" && !elements.input.value) view.toggleHelp();
  else if (e.key === "Escape" && state.pendingConfirmId) view.clearPendingConfirm();
  else return false;
  return true;
}

function panelHandleKeydown(context, e) {
  if (panelHandleShortcut(context, e)) {
    e.preventDefault();
    return;
  }
  const { state, view, hooks, controller } = context;
  switch (e.key) {
    case "ArrowDown":
    case "Tab":
      if (!e.shiftKey) { e.preventDefault(); view.selectNext(); }
      break;
    case "ArrowUp":
      e.preventDefault();
      view.selectPrev();
      break;
    case "Enter":
      e.preventDefault();
      if (state.selectedIndex >= 0) controller.navigateTo(state.flatResults[state.selectedIndex], e.ctrlKey || e.metaKey);
      break;
    case "Escape":
      e.preventDefault();
      hooks.close();
      break;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createPanelActions };
}
