export function getAuthCredentials() {
  return {
    username: process.env.AUTH_USERNAME ?? 'admin',
    password: process.env.AUTH_PASSWORD ?? '123456',
  }
}

export function validateCredentials(username: string, password: string) {
  const expected = getAuthCredentials()
  return username === expected.username && password === expected.password
}
