package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"time"

	"github.com/spf13/cobra"
)

var (
	hostFlag   string
	timeoutSec int
)

func main() {
	root := &cobra.Command{Use: "casaos-agent"}
	root.PersistentFlags().StringVar(&hostFlag, "host", "http://localhost:8080", "CasaOS API host")
	root.PersistentFlags().IntVar(&timeoutSec, "timeout", 10, "Request timeout (seconds)")

	root.AddCommand(&cobra.Command{
		Use:   "list",
		Short: "List all containers",
		RunE:  runList,
	})
	root.AddCommand(&cobra.Command{
		Use:   "stop NAME",
		Short: "Stop a container",
		Args:  cobra.ExactArgs(1),
		RunE:  runStop,
	})
	root.AddCommand(&cobra.Command{
		Use:   "start NAME",
		Short: "Start a container",
		Args:  cobra.ExactArgs(1),
		RunE:  runStart,
	})
	root.AddCommand(&cobra.Command{
		Use:   "logs NAME",
		Short: "Fetch container logs (last 50 lines)",
		Args:  cobra.ExactArgs(1),
		RunE:  runLogs,
	})

	if err := root.Execute(); err != nil {
		log.Fatal(err)
	}
}

func runList(cmd *cobra.Command, args []string) error {
	out, err := exec.Command("docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}\t{{.Image}}").CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker ps failed: %w", err)
	}
	fmt.Print(string(out))
	return nil
}

func runStop(cmd *cobra.Command, args []string) error {
	out, err := exec.Command("docker", "stop", args[0]).CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker stop failed: %w", err)
	}
	fmt.Printf("Stopped %s\n", string(out))
	return nil
}

func runStart(cmd *cobra.Command, args []string) error {
	out, err := exec.Command("docker", "start", args[0]).CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker start failed: %w", err)
	}
	fmt.Printf("Started %s\n", string(out))
	return nil
}

func runLogs(cmd *cobra.Command, args []string) error {
	out, err := exec.Command("docker", "logs", "--tail", "50", args[0]).CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker logs failed: %w", err)
	}
	fmt.Print(string(out))
	return nil
}

func doRequest(method, path string, body interface{}) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	}
	url := hostFlag + path
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	return b, nil
}
