from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session
from datetime import datetime, timedelta
import bcrypt, jwt

# ------------------ Налаштування ------------------
DB_URL = "sqlite:///./db.sqlite3"
JWT_SECRET = "super_secret_key"   # заміни на змінну середовища
JWT_ALGO = "HS256"
JWT_EXPIRES_MIN = 60

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

app = FastAPI(title="Admin API")
security = HTTPBearer()

# ------------------ Моделі ------------------
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    telegram_id = Column(String, unique=True, index=True)
    username = Column(String)
    balance = Column(Float, default=0.0)
    is_blocked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class Admin(Base):
    __tablename__ = "admins"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="admin")  # admin | superadmin

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey("admins.id"))
    action = Column(String)
    target_user_id = Column(Integer, ForeignKey("users.id"))
    details = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    admin = relationship("Admin")
    user = relationship("User")

Base.metadata.create_all(bind=engine)

# ------------------ Допоміжні ------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

def verify_password(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode(), hashed.encode())

def create_token(payload: dict) -> str:
    exp = datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MIN)
    payload.update({"exp": exp})
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def get_admin(db: Session, creds: HTTPAuthorizationCredentials):
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    admin = db.query(Admin).filter(Admin.id == payload["admin_id"]).first()
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")
    return admin

# ------------------ Роути ------------------
@app.post("/bootstrap_superadmin")
def bootstrap_superadmin(username: str, password: str, db: Session = Depends(get_db)):
    if db.query(Admin).count() > 0:
        raise HTTPException(status_code=400, detail="Admins already exist")
    admin = Admin(username=username, password_hash=hash_password(password), role="superadmin")
    db.add(admin)
    db.commit()
    return {"ok": True}

@app.post("/login")
def login(username: str, password: str, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == username).first()
    if not admin or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"admin_id": admin.id, "role": admin.role})
    return {"token": token, "role": admin.role}

@app.get("/users/{telegram_id}")
def get_user(telegram_id: str, creds: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    _ = get_admin(db, creds)
    u = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {"telegram_id": u.telegram_id, "username": u.username, "balance": u.balance, "is_blocked": u.is_blocked}

@app.post("/balance/delta")
def balance_delta(telegram_id: str, amount: float, reason: str, creds: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    admin = get_admin(db, creds)
    u = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    new_balance = u.balance + amount
    if new_balance < 0:
        raise HTTPException(status_code=400, detail="Balance cannot be negative")
    u.balance = new_balance
    u.updated_at = datetime.utcnow()
    db.add(AuditLog(admin_id=admin.id, action="DELTA_BALANCE", target_user_id=u.id, details=f"{amount}; {reason}"))
    db.commit()
    return {"ok": True, "balance": u.balance}

@app.post("/block")
def block_user(telegram_id: str, reason: str, creds: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    admin = get_admin(db, creds)
    u = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_blocked = True
    db.add(AuditLog(admin_id=admin.id, action="BLOCK", target_user_id=u.id, details=reason))
    db.commit()
    return {"ok": True}
