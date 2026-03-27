import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { bootstrapApp } from './app/bootstrap.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

await bootstrapApp().program.parseAsync(process.argv)
