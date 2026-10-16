(function () {
  "use strict";

  var STORAGE_TASKS = "taskflow_tasks";
  var STORAGE_THEME = "taskflow_theme";

  var state = {
    tasks: [],
    filter: "all",
    searchQuery: "",
  };

  var els = {};
  var lastFocusedElement = null;

  function $(id) {
    return document.getElementById(id);
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Could not read from localStorage:", e);
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
      return false;
    }
  }

  function loadTasks() {
    try {
      var raw = safeStorageGet(STORAGE_TASKS);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidTask).map(normalizeTask);
    } catch (e) {
      console.warn("Could not load tasks:", e);
      return [];
    }
  }

  function saveTasks() {
    safeStorageSet(STORAGE_TASKS, JSON.stringify(state.tasks));
  }

  function isValidTask(task) {
    return (
      task &&
      typeof task.id === "string" &&
      typeof task.title === "string" &&
      task.title.trim().length > 0 &&
      typeof task.completed === "boolean"
    );
  }

  function normalizePriority(priority) {
    if (priority === "high" || priority === "medium" || priority === "low") {
      return priority;
    }
    return "medium";
  }

  function normalizeTask(task) {
    var dueDate = parseISODate(task.dueDate) ? task.dueDate : todayISO();
    return {
      id: task.id,
      title: task.title.trim(),
      priority: normalizePriority(task.priority),
      dueDate: dueDate,
      completed: !!task.completed,
      createdAt: task.createdAt || new Date().toISOString(),
    };
  }

  function loadTheme() {
    var saved = safeStorageGet(STORAGE_THEME);
    if (saved === "dark" || saved === "light") return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var toggle = els.themeToggle;
    if (toggle) {
      var isDark = theme === "dark";
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      toggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    }
  }

  function saveTheme(theme) {
    safeStorageSet(STORAGE_THEME, theme);
  }

  function todayISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseISODate(iso) {
    var parts = iso.split("-");
    if (parts.length !== 3) return null;
    var y = Number(parts[0]);
    var m = Number(parts[1]) - 1;
    var d = Number(parts[2]);
    var date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  function formatDueDate(iso) {
    var date = parseISODate(iso);
    if (!date) return iso;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isOverdue(iso, completed) {
    if (completed) return false;
    var due = parseISODate(iso);
    if (!due) return false;
    var today = parseISODate(todayISO());
    return due < today;
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function priorityLabel(priority) {
    if (priority === "high") return "High";
    if (priority === "low") return "Low";
    return "Medium";
  }

  function getVisibleTasks() {
    var query = state.searchQuery.trim().toLowerCase();
    return state.tasks.filter(function (task) {
      if (state.filter === "active" && task.completed) return false;
      if (state.filter === "completed" && !task.completed) return false;
      if (query && task.title.toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
  }

  function updateStats() {
    var total = state.tasks.length;
    var completed = state.tasks.filter(function (t) {
      return t.completed;
    }).length;
    var percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    els.statTotal.textContent = String(total);
    els.statCompleted.textContent = String(completed);
    els.statPercent.textContent = percent + "%";
  }

  function updateListCount(visibleCount) {
    var label =
      visibleCount === 1 ? "Showing 1 task" : "Showing " + visibleCount + " tasks";
    els.listCount.textContent = label;
  }

  function getEmptyStateContent() {
    var hasTasks = state.tasks.length > 0;
    var hasSearch = state.searchQuery.trim().length > 0;

    if (!hasTasks) {
      return {
        title: "No tasks yet",
        message: "Add your first task above to get started.",
      };
    }
    if (hasSearch) {
      return {
        title: "No matches found",
        message: 'Nothing matches "' + state.searchQuery.trim() + '". Try a different search.',
      };
    }
    if (state.filter === "active") {
      return {
        title: "All caught up",
        message: "You have no active tasks. Completed items are in the Completed tab.",
      };
    }
    if (state.filter === "completed") {
      return {
        title: "No completed tasks",
        message: "Mark tasks done with the checkbox to see them here.",
      };
    }
    return {
      title: "No tasks to display",
      message: "Try changing your search or filter.",
    };
  }

  function renderTasks() {
    var visible = getVisibleTasks();
    els.taskList.innerHTML = "";

    visible.forEach(function (task) {
      var li = document.createElement("li");
      li.className = "task-item" + (task.completed ? " is-completed" : "");
      li.dataset.id = task.id;

      var overdue = isOverdue(task.dueDate, task.completed);

      var checkLabel = task.completed
        ? "Mark \"" + task.title + "\" as active"
        : "Mark \"" + task.title + "\" as complete";

      li.innerHTML =
        '<label class="task-check">' +
        '<input type="checkbox" aria-label="' +
        escapeAttr(checkLabel) +
        '"' +
        (task.completed ? " checked" : "") +
        " />" +
        '<span class="task-check-box"></span>' +
        "</label>" +
        '<div class="task-body">' +
        '<p class="task-title">' +
        escapeHtml(task.title) +
        "</p>" +
        '<div class="task-meta">' +
        '<span class="priority-badge priority-' +
        task.priority +
        '">' +
        priorityLabel(task.priority) +
        "</span>" +
        '<span class="task-due' +
        (overdue ? " is-overdue" : "") +
        '">' +
        (overdue ? "Overdue · " : "Due ") +
        escapeHtml(formatDueDate(task.dueDate)) +
        "</span>" +
        "</div>" +
        "</div>" +
        '<div class="task-actions">' +
        '<button type="button" class="btn btn-icon btn-edit" aria-label="Edit task">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>' +
        "</button>" +
        '<button type="button" class="btn btn-icon btn-danger btn-delete" aria-label="Delete task">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7V5h6v2M10 11v6M14 11v6M8 7l1 12h6l1-12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' +
        "</button>" +
        "</div>";

      els.taskList.appendChild(li);
    });

    var showEmpty = visible.length === 0;
    els.emptyState.hidden = !showEmpty;
    els.emptyState.setAttribute("aria-hidden", showEmpty ? "false" : "true");
    els.taskList.classList.toggle("is-hidden", showEmpty);

    if (showEmpty) {
      var empty = getEmptyStateContent();
      els.emptyTitle.textContent = empty.title;
      els.emptyMessage.textContent = empty.message;
    }

    updateListCount(visible.length);
    updateStats();
  }

  function clearFormErrors() {
    els.titleError.textContent = "";
    els.dueDateError.textContent = "";
    els.taskTitle.classList.remove("is-invalid");
    els.taskDueDate.classList.remove("is-invalid");
  }

  function validateTaskForm(title, dueDate) {
    clearFormErrors();
    var valid = true;

    if (!title) {
      els.titleError.textContent = "Please enter a task title.";
      els.taskTitle.classList.add("is-invalid");
      valid = false;
    } else if (title.length > 120) {
      els.titleError.textContent = "Title must be 120 characters or fewer.";
      els.taskTitle.classList.add("is-invalid");
      valid = false;
    }

    if (!dueDate) {
      els.dueDateError.textContent = "Please choose a due date.";
      els.taskDueDate.classList.add("is-invalid");
      valid = false;
    } else if (!parseISODate(dueDate)) {
      els.dueDateError.textContent = "Due date is not valid.";
      els.taskDueDate.classList.add("is-invalid");
      valid = false;
    }

    return valid;
  }

  function focusTaskFormError(title, dueDate) {
    if (!title || title.length > 120) {
      els.taskTitle.focus();
      return;
    }
    if (!dueDate || !parseISODate(dueDate)) {
      els.taskDueDate.focus();
    }
  }

  function clearEditErrors() {
    els.editTitleError.textContent = "";
    els.editDueDateError.textContent = "";
    els.editTitle.classList.remove("is-invalid");
    els.editDueDate.classList.remove("is-invalid");
  }

  function validateEditForm(title, dueDate) {
    clearEditErrors();
    var valid = true;

    if (!title) {
      els.editTitleError.textContent = "Please enter a task title.";
      els.editTitle.classList.add("is-invalid");
      valid = false;
    } else if (title.length > 120) {
      els.editTitleError.textContent = "Title must be 120 characters or fewer.";
      els.editTitle.classList.add("is-invalid");
      valid = false;
    }

    if (!dueDate) {
      els.editDueDateError.textContent = "Please choose a due date.";
      els.editDueDate.classList.add("is-invalid");
      valid = false;
    } else if (!parseISODate(dueDate)) {
      els.editDueDateError.textContent = "Due date is not valid.";
      els.editDueDate.classList.add("is-invalid");
      valid = false;
    }

    return valid;
  }

  function focusEditFormError(title, dueDate) {
    if (!title || title.length > 120) {
      els.editTitle.focus();
      return;
    }
    if (!dueDate || !parseISODate(dueDate)) {
      els.editDueDate.focus();
    }
  }

  function addTask(title, priority, dueDate) {
    var task = {
      id: generateId(),
      title: title,
      priority: normalizePriority(priority),
      dueDate: dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    state.tasks.unshift(task);
    saveTasks();
    renderTasks();
  }

  function findTaskIndex(id) {
    return state.tasks.findIndex(function (t) {
      return t.id === id;
    });
  }

  function toggleComplete(id, completed) {
    var index = findTaskIndex(id);
    if (index === -1) return;
    state.tasks[index].completed = completed;
    saveTasks();
    renderTasks();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) {
      return t.id !== id;
    });
    saveTasks();
    renderTasks();
  }

  function openEditDialog(task) {
    els.editTaskId.value = task.id;
    els.editTitle.value = task.title;
    els.editPriority.value = task.priority;
    els.editDueDate.value = task.dueDate;
    clearEditErrors();
    lastFocusedElement = document.activeElement;
    if (typeof els.editDialog.showModal === "function") {
      if (els.editDialog.open) {
        els.editDialog.close();
      }
      els.editDialog.showModal();
      els.editTitle.focus();
      return;
    }
    els.editDialog.setAttribute("open", "");
    document.body.classList.add("dialog-open");
    els.editDialog.setAttribute("aria-modal", "true");
    els.editTitle.focus();
  }

  function saveEdit() {
    var id = els.editTaskId.value;
    var title = els.editTitle.value.trim();
    var priority = els.editPriority.value;
    var dueDate = els.editDueDate.value;

    if (!validateEditForm(title, dueDate)) {
      focusEditFormError(title, dueDate);
      return;
    }

    var index = findTaskIndex(id);
    if (index === -1) {
      closeEditDialog();
      return;
    }

    state.tasks[index].title = title;
    state.tasks[index].priority = normalizePriority(priority);
    state.tasks[index].dueDate = dueDate;
    saveTasks();
    renderTasks();
    closeEditDialog();
  }

  function closeEditDialog() {
    document.body.classList.remove("dialog-open");
    if (els.editDialog.open && typeof els.editDialog.close === "function") {
      els.editDialog.close();
    } else {
      els.editDialog.removeAttribute("open");
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  function setFilter(filter) {
    if (filter !== "all" && filter !== "active" && filter !== "completed") {
      return;
    }
    state.filter = filter;
    var buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(function (btn) {
      var isActive = btn.dataset.filter === filter;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    renderTasks();
  }

  function bindEvents() {
    els.taskForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = els.taskTitle.value.trim();
      var priority = els.taskPriority.value;
      var dueDate = els.taskDueDate.value;

      if (!validateTaskForm(title, dueDate)) {
        focusTaskFormError(title, dueDate);
        return;
      }

      addTask(title, priority, dueDate);
      els.taskForm.reset();
      els.taskDueDate.value = todayISO();
      clearFormErrors();
      els.taskTitle.focus();
    });

    els.taskList.addEventListener("change", function (e) {
      if (e.target.type !== "checkbox") return;
      var item = e.target.closest(".task-item");
      if (!item) return;
      toggleComplete(item.dataset.id, e.target.checked);
    });

    els.taskList.addEventListener("click", function (e) {
      var editBtn = e.target.closest(".btn-edit");
      var deleteBtn = e.target.closest(".btn-delete");
      var item = e.target.closest(".task-item");
      if (!item) return;
      var id = item.dataset.id;
      var index = findTaskIndex(id);
      if (index === -1) return;

      if (editBtn) {
        openEditDialog(state.tasks[index]);
        return;
      }

      if (deleteBtn) {
        e.preventDefault();
        deleteTask(id);
        return;
      }
    });

    document.querySelectorAll(".filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setFilter(btn.dataset.filter);
      });
    });

    els.searchInput.addEventListener("input", function () {
      state.searchQuery = els.searchInput.value;
      renderTasks();
    });

    els.themeToggle.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
    });

    els.editForm.addEventListener("submit", function (e) {
      e.preventDefault();
      saveEdit();
    });

    els.editCancel.addEventListener("click", closeEditDialog);
    els.editClose.addEventListener("click", closeEditDialog);

    els.editDialog.addEventListener("cancel", function (e) {
      e.preventDefault();
      closeEditDialog();
    });

    els.editDialog.addEventListener("click", function (e) {
      if (e.target === els.editDialog) {
        closeEditDialog();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.editDialog.hasAttribute("open")) {
        closeEditDialog();
      }
    });
  }

  function cacheElements() {
    els.statTotal = $("statTotal");
    els.statCompleted = $("statCompleted");
    els.statPercent = $("statPercent");
    els.taskForm = $("taskForm");
    els.taskTitle = $("taskTitle");
    els.taskPriority = $("taskPriority");
    els.taskDueDate = $("taskDueDate");
    els.titleError = $("titleError");
    els.dueDateError = $("dueDateError");
    els.taskList = $("taskList");
    els.emptyState = $("emptyState");
    els.emptyTitle = $("emptyTitle");
    els.emptyMessage = $("emptyMessage");
    els.listCount = $("listCount");
    els.searchInput = $("searchInput");
    els.themeToggle = $("themeToggle");
    els.editDialog = $("editDialog");
    els.editForm = $("editForm");
    els.editTaskId = $("editTaskId");
    els.editTitle = $("editTitle");
    els.editPriority = $("editPriority");
    els.editDueDate = $("editDueDate");
    els.editTitleError = $("editTitleError");
    els.editDueDateError = $("editDueDateError");
    els.editCancel = $("editCancel");
    els.editClose = $("editClose");
  }

  function init() {
    cacheElements();
    if (!els.taskForm || !els.taskList || !els.themeToggle) {
      console.error("TaskFlow AI: required DOM elements are missing.");
      return;
    }
    state.tasks = loadTasks();
    var theme = loadTheme();
    applyTheme(theme);
    els.taskDueDate.value = todayISO();
    bindEvents();
    renderTasks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
