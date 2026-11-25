from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg://echo:echo_dev_password@localhost:5434/echo"
    JWT_SECRET_KEY: str
    FRONTEND_URL: str = "http://localhost:3000"
    COOKIE_SECURE: bool = False
    AI_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-4.1-mini"
    AVATAR_PROVIDER: str = "liveavatar"
    LIVEAVATAR_API_KEY: str = ""
    LIVEAVATAR_DEFAULT_AVATAR_ID: str = ""
    LIVEAVATAR_ENABLED: bool = True
    LIVEAVATAR_SANDBOX: bool = True
    LIVEAVATAR_AVATAR_1_ID: str = ""
    LIVEAVATAR_AVATAR_1_VOICE_ID: str = ""
    LIVEAVATAR_AVATAR_1_MODEL: str = ""
    LIVEAVATAR_AVATAR_2_ID: str = ""
    LIVEAVATAR_AVATAR_2_VOICE_ID: str = ""
    LIVEAVATAR_AVATAR_2_MODEL: str = ""
    LIVEAVATAR_AVATAR_3_ID: str = ""
    LIVEAVATAR_AVATAR_3_VOICE_ID: str = ""
    LIVEAVATAR_AVATAR_3_MODEL: str = ""
    LIVEAVATAR_AVATAR_4_ID: str = ""
    LIVEAVATAR_AVATAR_4_VOICE_ID: str = ""
    LIVEAVATAR_AVATAR_4_MODEL: str = ""
    LIVEAVATAR_AVATAR_5_ID: str = ""
    LIVEAVATAR_AVATAR_5_VOICE_ID: str = ""
    LIVEAVATAR_AVATAR_5_MODEL: str = ""
    LIVEAVATAR_AVATAR_6_ID: str = ""
    LIVEAVATAR_AVATAR_6_VOICE_ID: str = ""
    LIVEAVATAR_AVATAR_6_MODEL: str = ""
    TAVUS_API_KEY: str = ""
    TAVUS_ENABLED: bool = False
    TAVUS_PAL_ID: str = ""
    TAVUS_AVATAR_1_ID: str = ""
    TAVUS_AVATAR_1_NAME: str = ""
    TAVUS_AVATAR_2_ID: str = ""
    TAVUS_AVATAR_2_NAME: str = ""
    TAVUS_AVATAR_3_ID: str = ""
    TAVUS_AVATAR_3_NAME: str = ""
    TAVUS_AVATAR_4_ID: str = ""
    TAVUS_AVATAR_4_NAME: str = ""
    TAVUS_AVATAR_5_ID: str = ""
    TAVUS_AVATAR_5_NAME: str = ""
    TAVUS_AVATAR_6_ID: str = ""
    TAVUS_AVATAR_6_NAME: str = ""
    TAVUS_AVATAR_7_ID: str = ""
    TAVUS_AVATAR_7_NAME: str = ""
    TAVUS_AVATAR_8_ID: str = ""
    TAVUS_AVATAR_8_NAME: str = ""
    AVATAR_SDK_ENABLED: bool = False
    AVATAR_SDK_CLIENT_ID: str = ""
    AVATAR_SDK_CLIENT_SECRET: str = ""
    AVATAR_STORAGE_DIR: str = "/var/lib/echo/avatars"
    REDIS_URL: str = "redis://localhost:6379/0"
    APP_ENV: str = "development"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def settings(): return Settings()
