import { createHash } from 'node:crypto'
import { userInfo } from 'node:os'

export function nativeVaultPipePath(
  username = userInfo().username,
  userDomain = process.env.USERDOMAIN ?? '',
): string {
  if (
    typeof username !== 'string' ||
    username.length === 0 ||
    username.length > 256 ||
    username.includes('\0') ||
    typeof userDomain !== 'string' ||
    userDomain.length > 256 ||
    userDomain.includes('\0')
  ) {
    throw new Error('Invalid local Windows identity')
  }
  const identity = `${userDomain}\\${username}`.toLocaleLowerCase('en-US')
  const suffix = createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 24)
  return `\\\\.\\pipe\\maer-chat-password-vault-${suffix}`
}
