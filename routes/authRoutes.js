const express = require("express");
const {
    confirmEmailVerification,
    confirmMobileVerification,
    forgotPassword,
    getRegistrationConfig,
    login,
    logout,
    me,
    register,
    requestEmailVerification,
    requestMobileVerification,
    resetPassword,
    verifyOtp
} = require("../controllers/authController");
const { apiAuthMiddleware, requireSessionPurpose } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/register/config", getRegistrationConfig);
router.post("/verification/email/request", requestEmailVerification);
router.post("/verification/email/confirm", confirmEmailVerification);
router.post("/verification/mobile/request", requestMobileVerification);
router.post("/verification/mobile/confirm", confirmMobileVerification);
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);
router.get("/me", apiAuthMiddleware, requireSessionPurpose("auth"), me);

module.exports = router;
