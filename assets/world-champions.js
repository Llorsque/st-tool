
document.addEventListener("DOMContentLoaded", () => {
  const genderButtons = Array.from(document.querySelectorAll(".wc-gender-btn"));
  const distanceTabs = Array.from(document.querySelectorAll(".wc-tab"));
  const panels = Array.from(document.querySelectorAll(".wc-panel"));

  let activeGender = "men";
  let activeDistance = "500";

  function updatePanels() {
    panels.forEach((panel) => {
      const matchesGender = panel.dataset.gender === activeGender;
      const matchesDistance = panel.dataset.distance === activeDistance;
      if (matchesGender && matchesDistance) {
        panel.classList.add("is-active");
      } else {
        panel.classList.remove("is-active");
      }
    });
  }

  genderButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.genderTarget;
      if (!target || target === activeGender) return;
      activeGender = target;

      genderButtons.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("is-active", isActive);
        b.setAttribute("aria-pressed", String(isActive));
      });

      updatePanels();
    });
  });

  distanceTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.distanceTarget;
      if (!target || target === activeDistance) return;
      activeDistance = target;

      distanceTabs.forEach((t) => {
        t.classList.toggle("is-active", t === tab);
      });

      updatePanels();
    });
  });

  updatePanels();
});
