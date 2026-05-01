import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import * as tar from 'tar'

const MAXMIND_URL = (key: string) =>
  `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${key}&suffix=tar.gz`

/**
 * Download GeoLite2-City.mmdb from MaxMind and write it to `destPath`.
 * Downloads to a temp file first, then extracts just the .mmdb via `tar`.
 * Throws on network errors, non-200 responses, or extraction failures.
 */
export async function downloadMmdb(licenseKey: string, destPath: string): Promise<void> {
  const res = await fetch(MAXMIND_URL(licenseKey))
  if (!res.ok || !res.body) {
    throw new Error(`MaxMind download failed: ${res.status} ${res.statusText}`)
  }

  // Write response body to a temp file before extracting (tar.x requires a file path)
  const tmpFile = join(tmpdir(), `parsedmarc-geoip-${Date.now()}.tar.gz`)
  const buf = await res.arrayBuffer()
  await writeFile(tmpFile, Buffer.from(buf))

  try {
    const destDir = dirname(destPath)
    await mkdir(destDir, { recursive: true })

    // strip: 1 removes the date-stamped directory prefix (GeoLite2-City_YYYYMMDD/)
    // filter keeps only the .mmdb file so we don't extract unneeded text files
    await tar.x({
      file: tmpFile,
      cwd: destDir,
      strip: 1,
      filter: (p: string) => p.endsWith('.mmdb'),
    })
  }
  finally {
    await unlink(tmpFile).catch(() => {})
  }
}
