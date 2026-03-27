export interface CliRenderers {
  info(message: string): void;
  error(message: string): void;
  stream(chunk: string): boolean;
}

export interface CliOutput {
  log(message: string): void;
  error(message: string): void;
  write?(chunk: string): void;
}

export function createCliRenderers(output: CliOutput = console): CliRenderers {
  let streamLineOpen = false;

  const writeChunk =
    output.write ??
    (typeof process.stdout.write === "function"
      ? (chunk: string) => {
          process.stdout.write(chunk);
        }
      : undefined);

  const closeStreamLine = () => {
    if (!streamLineOpen) {
      return;
    }

    if (writeChunk) {
      writeChunk("\n");
    } else {
      output.log("");
    }

    streamLineOpen = false;
  };

  return {
    info(message: string) {
      closeStreamLine();
      output.log(message);
    },
    error(message: string) {
      closeStreamLine();
      output.error(message);
    },
    stream(chunk: string) {
      if (chunk.length === 0) {
        return false;
      }

      if (writeChunk) {
        writeChunk(chunk);
      } else {
        output.log(chunk);
      }

      streamLineOpen = !chunk.endsWith("\n");
      return true;
    },
  };
}
