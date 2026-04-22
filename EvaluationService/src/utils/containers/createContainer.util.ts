import Docker from "dockerode";
import logger from "../../config/logger.config";

export interface CreateContainerOptions {
  imageName: string;
  cmd: string[];
  memoryLimit: number;
}

export async function createNewDockerContainer(
  options: CreateContainerOptions,
): Promise<Docker.Container | null> {
  try {
    const docker = new Docker();
    if (!options.memoryLimit || options.memoryLimit <= 0) {
      throw new Error("Invalid memory limit");
    }
    await new Promise((resolve, reject) => {
      docker.pull(
        options.imageName,
        (err: Error, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);

          docker.modem.followProgress(stream, (err) =>
            err ? reject(err) : resolve(true),
          );
        },
      );
    });
    const container = await docker.createContainer({
      Image: options.imageName,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: options.cmd,
      HostConfig: {
        Memory: options.memoryLimit,
        PidsLimit: 100,
        CpuQuota: 50000,
        CpuPeriod: 100000,
        SecurityOpt: ["no-new-privileges"],
        NetworkMode: "none",
      },
      OpenStdin: true,
      StdinOnce: false,
    });
    logger.info("Docker container created successfully", {
      image: options.imageName,
      cmd: options.cmd,
    });
    return container;
  } catch (error: any) {
    logger.error("Error creating new docker container", {
      message: error.message,
      stack: error.stack,
      options,
    });

    return null;
  }
}
