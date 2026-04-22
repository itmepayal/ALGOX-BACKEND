import Docker from "dockerode";
import { CPP_IMAGE, PYTHON_IMAGE } from "../constants";
import logger from "../../config/logger.config";

const docker = new Docker({
  socketPath:
    process.env.DOCKER_HOST?.replace("unix://", "") || "/var/run/docker.sock",
});

export async function pullImage(image: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(
      image,
      (err: { message: any }, stream: NodeJS.ReadableStream) => {
        if (err) {
          console.error("Docker pull error:", err.message);
          return reject(err);
        }

        if (!stream) {
          return reject(new Error("No stream returned from Docker"));
        }

        docker.modem.followProgress(
          stream,
          (error: Error | null) => {
            if (error) {
              console.error("Pull failed:", error.message);
              return reject(error);
            }

            console.log("Image pulled successfully");
            resolve();
          },
          (event: any) => {
            if (event.status) {
              console.log(`${event.status}`);
            }
          },
        );
      },
    );
  });
}

export async function pullAllImages() {
  const images = [PYTHON_IMAGE, CPP_IMAGE];

  const promises = images.map((image) => pullImage(image));
  try {
    await Promise.all(promises);
    logger.info("Successfully pulled images");
  } catch (error) {
    logger.error("Error while pulling images", error);
  }
}
