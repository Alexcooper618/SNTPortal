import { Router } from "express";
import { registerSnt, login } from "../controllers/auth.controller";

const router = Router();

// Создание СНТ + автоматическое создание председателя
router.post("/register-snt", registerSnt);

// Логин пользователя по номеру телефона
router.post("/login", login);

export default router;
