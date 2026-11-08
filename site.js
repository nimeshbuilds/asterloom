// The page remains readable without JavaScript. Enhance only the world gallery
// and the full-size screenshot; no tracking, network calls or stored identifiers.
const tabs = [...document.querySelectorAll("[data-world]")];
const tablist = document.querySelector(".world-tabs");
if (tablist && tabs.length) {
  tablist.setAttribute("role", "tablist");
  function selectTab(tab, moveFocus = false) {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      candidate.classList.toggle("is-active", selected);
      const panel = document.getElementById(
        candidate.getAttribute("aria-controls"),
      );
      if (panel) panel.hidden = !selected;
    }
    if (moveFocus) tab.focus();
  }
  for (const tab of tabs) {
    tab.setAttribute("role", "tab");
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;
    }
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        selectTab(tabs[next], true);
      }
    });
  }
  selectTab(tabs[0]);
  document.documentElement.classList.add("js-enabled");
}

const dialog = document.querySelector(".screenshot-dialog");
const openScreenshot = document.querySelector("[data-open-screenshot]");
if (dialog && openScreenshot && typeof dialog.showModal === "function") {
  openScreenshot.addEventListener("click", (event) => {
    event.preventDefault();
    dialog.showModal();
    document.body.classList.add("dialog-open");
  });
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    openScreenshot.focus({ preventScroll: true });
  });
}
