import { Request, Response } from "express";
import { prisma } from "../db";
import jwt from "jsonwebtoken";

export const registerSnt = async (req: Request, res: Response) => {
  try {
    const { sntName, location, chairmanName, chairmanPhone } = req.body;

    const snt = await prisma.snt.create({
      data: {
        name: sntName,
        location,
        users: {
          create: {
            name: chairmanName,
            phone: chairmanPhone,
            role: "CHAIRMAN",
          },
        },
      },
      include: { users: true },
    });

    const chairman = snt.users[0];

    const token = jwt.sign(
      { userId: chairman.id, role: chairman.role, sntId: snt.id },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({ snt, token });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Unable to register SNT" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        sntId: user.sntId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
};
