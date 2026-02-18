export type AuthUser = {
  id?: string;
  username?: string;
  name?: string;
  email?: string;
  roles?: string[];
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  user?: AuthUser;
  roles?: string[];
};

export type MeResponse = {
  user?: AuthUser;
  roles?: string[];
  username?: string;
  email?: string;
};
