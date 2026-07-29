const express = require("express");
const {
    addCompound,
    bulkInsertCompounds,
    bulkInsertElements,
    deleteSheet,
    getCompoundByFormula,
    getCompounds,
    getElements,
    loadSheet,
    resolveFormula,
    saveSheet,
    smartSearch,
    submitFeedback
} = require("../controllers/labController");
const {
    getAuditActivity,
    getOverview,
    getSessions,
    getTopSearchedCompounds,
    getTrafficStats,
    getUsers
} = require("../controllers/adminController");
const { requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/compounds", getCompounds);
router.post("/compounds", requireRole("admin", "superadmin"), addCompound);
router.get("/compounds/:formula", getCompoundByFormula);
router.post("/compounds/bulk", requireRole("admin", "superadmin"), bulkInsertCompounds);
router.get("/search", smartSearch);
router.post("/formula/resolve", resolveFormula);

router.get("/elements", getElements);
router.post("/elements/bulk", requireRole("admin", "superadmin"), bulkInsertElements);

router.post("/save", saveSheet);
router.get("/load/:name", loadSheet);
router.delete("/delete/:name", deleteSheet);
router.post("/feedback", submitFeedback);

router.get("/admin/analytics/overview", requireRole("admin", "superadmin"), getOverview);
router.get("/admin/analytics/top-searches", requireRole("admin", "superadmin"), getTopSearchedCompounds);
router.get("/admin/analytics/traffic", requireRole("admin", "superadmin"), getTrafficStats);
router.get("/admin/audit-logs", requireRole("admin", "superadmin"), getAuditActivity);
router.get("/admin/users", requireRole("admin", "superadmin"), getUsers);
router.get("/admin/sessions", requireRole("admin", "superadmin"), getSessions);

module.exports = router;
