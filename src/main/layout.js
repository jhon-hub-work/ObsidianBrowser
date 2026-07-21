// Single source of truth for chrome dimensions.
// Derived from assets/ref/obsidian-ui-final.png (2880x1680 @2x => 1440x840 CSS).
// Sidebar and right panel are FULL HEIGHT; only the middle column is split
// into topbar / tabbar / content.
module.exports = {
  TOPBAR: 54,   // omnibox row (middle column only)
  TABBAR: 54,   // tab strip
  SIDEBAR: 236, // pinned + workspaces + profile card
  RIGHT: 216    // AI assistant + today card
};
